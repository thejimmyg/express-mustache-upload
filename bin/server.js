const cookieParser = require('cookie-parser')
const fileUpload = require('express-fileupload')
const debug = require('debug')('express-mustache-upload')
const express = require('express')
const path = require('path')
const { prepareMustacheOverlays, setupErrorHandlers } = require('express-mustache-overlays')
const shell = require('shelljs')
const fs = require('fs')
const { makeStaticWithUser, setupMiddleware } = require('express-mustache-jwt-signin')
const { promisify } = require('util')

const lstatAsync = promisify(fs.lstat)
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
const signInURL = process.env.SIGN_IN_URL || '/user/signin'
const signOutURL = process.env.SIGN_OUT_URL || '/user/signout'
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
const disabledAuthUser = process.env.DISABLED_AUTH_USER
const mustacheDirs = process.env.MUSTACHE_DIRS ? process.env.MUSTACHE_DIRS.split(':') : []
const publicFilesDirs = process.env.PUBLIC_FILES_DIRS ? process.env.PUBLIC_FILES_DIRS.split(':') : []
const publicURLPath = process.env.PUBLIC_URL_PATH || scriptName + '/public'
const listTitle = process.env.LIST_TITLE || 'Upload Files'
const uploadTitle = process.env.EDIT_TITLE || 'Uploading'

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const overlays = await prepareMustacheOverlays(app, { scriptName, publicURLPath })

  app.use((req, res, next) => {
    debug('Setting up locals')
    res.locals = Object.assign({}, res.locals, { publicURLPath, scriptName, title: 'Express Mustache Upload', signOutURL: signOutURL, signInURL: signInURL })
    next()
  })

  const authMiddleware = await setupMiddleware(app, secret, { overlays, signOutURL, signInURL })
  const { signedIn, hasClaims } = authMiddleware
  let { withUser } = authMiddleware
  if (disableAuth) {
    withUser = makeStaticWithUser(JSON.parse(disabledAuthUser || 'null'))
  }
  app.use(withUser)

  overlays.overlayMustacheDir(path.join(__dirname, '..', 'views'))
  overlays.overlayPublicFilesDir(path.join(__dirname, '..', 'public'))

  // Set up any other overlays directories here
  mustacheDirs.forEach(dir => {
    debug('Adding mustache dir', dir)
    overlays.overlayMustacheDir(dir)
  })
  publicFilesDirs.forEach(dir => {
    debug('Adding publicFiles dir', dir)
    overlays.overlayPublicFilesDir(dir)
  })

  app.use(fileUpload())
  app.get(scriptName, signedIn, async (req, res, next) => {
    try {
      debug('Upload / handler')
      const ls = shell.ls('-R', uploadDir)
      if (shell.error()) {
        throw new Error('Could not list ' + uploadDir)
      }
      const files = []
      for (let filename of ls) {
        const stat = await lstatAsync(path.join(uploadDir, filename))
        if (stat.isFile()) {
          files.push({ name: filename, url: scriptName + '/upload?filename=' + encodeURIComponent(filename) })
        }
      }
      res.render('list', { title: listTitle, files })
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  app.all(scriptName + '/upload', signedIn, hasClaims(claims => claims.admin), async (req, res, next) => {
    try {
      debug('Upload handler')

      let uploadError = ''
      let uploadSuccess = ''
      const action = req.originalUrl
      const expected = path.normalize(uploadDir)
      let content = ''
      let filename = req.query['filename']
      if (req.method === 'POST') {
        if (Object.keys(req.files).length === 0) {
          return res.status(400).send('No files were uploaded.')
        }
        let sampleFile = req.files.content
        if (!filename) {
          filename = sampleFile.name
        }
        const filePath = path.join(uploadDir, filename)
        debug(filename, filePath)
        if (!path.normalize(filePath).startsWith(expected + '/')) {
          throw new Error('Requested file is not in the editable directory: ' + filePath)
        }
        debug(filePath)
        shell.mkdir('-p', path.dirname(filePath))
        if (shell.error()) {
          throw new Error(`Could not create directories for ${filePath}.`)
        }
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
          res.render('upload', { title: uploadTitle, uploadError, action, filename })
          return
        }
      }
      if (req.method === 'GET' || uploadError.length === 0) {
        content = ''
      }
      res.render('upload', { title: uploadTitle, action, uploadSuccess, content, filename })
    } catch (e) {
      next(e)
    }
  })

  await overlays.setup()

  setupErrorHandlers(app)

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGINT and SIGTERM for docker
process.on('SIGINT', function () {
  console.log('Received SIGINT. Exiting ...')
  process.exit()
})
process.on('SIGTERM', function () {
  console.log('Received SIGTERM. Exiting ...')
  process.exit()
})
