# Express File Uploader

**CAUTION: Under active development, not suitable for production use for people
outside the development team yet.**

This script will look at the URL path then the uploaded file name when choosing how to name a file.

## Example

```
npm install
DISABLE_AUTH=true SCRIPT_NAME="" DEBUG=express-file-uploader,express-mustache-jwt-signin DIR=uploads PORT=9006 SECRET='reallysecret' npm start
```

Visit http://localhost:9006.

You should be able to make requests to routes restricted with `signedIn`
middleware as long as you have the cookie, or use the JWT in an `Authorization
header like this:

```
Authorization: Bearer <JWT goes here>
```

A good way of organising this is to use `gateway-lite` as your gateway proxying
both to `express-mustache-jwt-signin` and this module. Then you can use
`express-mustache-jwt-signin` to set the cookie that this project can read as
long as the `SECRET` environmrnt variables are the same.

If you just enable `SECRET` but don't set up the proxy, you'll just get
redirected to the `SIGN_IN_URL` (set to `/user/signin` in the example) and see
a 404 page.

## Development

```
npm run fix
```

## Docker

```
npm run docker:build
docker login <REGISTRY_URL>
npm run docker:push
npm run docker:run
```

## Changelog

### 0.1.0 2018-12-17

* Initial release
