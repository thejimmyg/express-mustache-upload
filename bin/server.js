const cookieParser = require('cookie-parser')
const fileUpload = require('express-fileupload')
const debug = require('debug')('express-file-uploader')
const express = require('express')
const path = require('path')
const setupMustache = require('express-mustache-overlays')
const shell = require('shelljs')
const { setupMiddleware } = require('express-mustache-jwt-signin')

const port = process.env.PORT || 80
const scriptName = process.env.SCRIPT_NAME || ''
if (scriptName.endsWith('/')) {
  throw new Error('SCRIPT_NAME should not end with /.')
}
const uploadDir = process.env.DIR
if (!uploadDir) {
  throw new Error('No DIR environment variable set to specify the path for uploaded files.')
}
const secret = process.env.SECRET
const signInURL = process.env.SIGN_IN_URL
const disableAuth = ((process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true')
if (!disableAuth) {
  if (!secret || secret.length < 8) {
    throw new Error('No SECRET environment variable set, or the SECRET is too short. Need 8 characters')
  }
  if (!signInURL) {
    throw new Error('No SIGN_IN_URL environment variable set')
  }
} else {
  debug('Disabled auth')
}
const mustacheDirs = process.env.MUSTACHE_DIRS ? process.env.MUSTACHE_DIRS.split(':') : []
mustacheDirs.push(path.join(__dirname, '..', 'views'))

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const templateDefaults = { title: 'Title', scriptName, signOutURL: '/user/signout', signInURL: '/user/signin' }
  await setupMustache(app, templateDefaults, mustacheDirs)

  let { signedIn, withUser, hasClaims } = setupMiddleware(secret, { signInURL })
  if (disableAuth) {
    signedIn = function (req, res, next) {
      debug(`signedIn disabled by DISBABLE_AUTH='true'`)
      next()
    }
    hasClaims = function () {
      return function (req, res, next) {
        debug(`hasClaims disabled by DISBABLE_AUTH='true'`)
        next()
      }
    }
  } else {
    app.use(withUser)
  }

  app.use(fileUpload())
  app.get(scriptName, signedIn, (req, res) => {
    debug('Upload / handler')
    const ls = shell.ls(uploadDir)
    if (shell.error()) {
      throw new Error('Could not list ' + uploadDir)
    }
    const files = []
    for (let filename of ls) {
      files.push({ name: filename, url: scriptName + '/upload/' + encodeURIComponent(filename) })
    }
    res.render('list', { user: req.user, scriptName, title: 'List', files })
  })

  app.all(scriptName + '/upload/*', signedIn, hasClaims(claims => claims.admin), async (req, res) => {
    debug('Upload upload/* handler')
    let uploadError = ''
    let uploadSuccess = ''
    const action = req.path
    let content = ''
    let filename = req.params[0]
    if (req.method === 'POST') {
      if (Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.')
      }
      let sampleFile = req.files.content
      filename = req.params[0]
      if (!filename) {
        filename = sampleFile.name
      }
      const filePath = path.join(uploadDir, filename)
      debug(filename, filePath)
      try {
        await new Promise((resolve, reject) => {
          // Use the mv() method to place the file somewhere on your server
          sampleFile.mv(filePath, function (err) {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        uploadSuccess = 'File saved.'
      } catch (e) {
        uploadError = 'Could not save the file'
        debug(e)
        res.render('upload', { user: req.user, title: 'Upload', scriptName, uploadError, action, filename })
        return
      }
    }
    if (req.method === 'GET' || uploadError.length === 0) {
      content = ''
    }
    res.render('upload', { user: req.user, title: 'Upload', scriptName, uploadSuccess, content, filename })
  })

  app.use(express.static(path.join(__dirname, '..', 'public')))

  // Must be after other routes - Handle 404
  app.get('*', (req, res) => {
    res.status(404)
    res.render('404', { user: req.user, scriptName })
  })

  // Error handler has to be last
  app.use(function (err, req, res, next) {
    debug('Error:', err)
    res.status(500)
    try {
      res.render('500', { user: req.user, scriptName })
    } catch (e) {
      debug('Error during rendering 500 page:', e)
      res.send('Internal server error.')
    }
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGNIN for docker
process.on('SIGINT', function () {
  console.log('Exiting ...')
  process.exit()
})
