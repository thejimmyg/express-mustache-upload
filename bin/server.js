const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const debug = require('debug')('express-file-uploader')
const express = require('express')
const fs = require('fs')
const path = require('path')
const setupMustache = require('express-mustache-overlays')
const shell = require('shelljs')
const { setupMiddleware } = require('express-mustache-jwt-signin')
const { promisify } = require('util')

const readFileAsync = promisify(fs.readFile)
const writeFileAsync = promisify(fs.writeFile)

const port = process.env.PORT || 9005
const scriptName = process.env.SCRIPT_NAME || ''
const uploadDir = process.env.DIR
if (!uploadDir) {
  throw new Error('No DIR environment variable set to specify the path for uploaded files.')
}
const secret = process.env.SECRET
if (!secret || secret.length < 8) {
  throw new Error('No SECRET environment variable set, or the SECRET is too short. Need 8 characters')
}
const mustacheDirs = process.env.MUSTACHE_DIRS ? process.env.MUSTACHE_DIRS.split(':') : []
mustacheDirs.push(path.join(__dirname, '..', 'views'))
const signInURL = process.env.SIGN_IN_URL
if (!signInURL) {
  throw new Error('No SIGN_IN_URL environment variable set')
}

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const templateDefaults = { title: 'Title', scriptName, signOutURL: '/user/signout', signInURL: '/user/signin' }
  await setupMustache(app, templateDefaults, mustacheDirs)

  const {signedIn, withUser, hasClaims } = setupMiddleware(secret, {signInURL})
  app.use(withUser)

  app.use(bodyParser.urlencoded({ extended: true }))
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
    const filename = req.params[0]
    const filePath = path.join(uploadDir, filename)
    debug(filename, filePath)
    let uploadError = ''
    let uploadSuccess = ''
    const action = req.path
    let content = ''
    if (req.method === 'POST') {
      content = req.body.content
      let error = false
      try {
        await writeFileAsync(filePath, content, { encoding: 'UTF-8' })
      } catch (e) {
        uploadError = 'Could not save the file'
        debug(e.toString())
        error = true
      }
      if (error) {
        res.render('upload', { user: req.user, title: 'Success', scriptName, content, uploadError, action, filename })
        return
      } else {
        uploadSuccess = 'File saved.'
      }
    }
    if (req.method === 'GET' || uploadError.length === 0) {
      try {
        content = await readFileAsync(filePath, { encoding: 'UTF-8' })
      } catch (e) {
        debug(e)
        content = ''
      }
      debug(content)
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
    res.status(500).send('Something broke!')
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGNIN for docker
process.on('SIGINT', function () {
  console.log('Exiting ...')
  process.exit()
})
