# Express File Uploader

**CAUTION: Under active development, not suitable for production use for people
outside the development team yet.**

This script will look at the URL path then the uploaded file name when choosing how to name a file.

## Config

You configure the container by setting environment variables:

* `DIR` - The path which files should be uploaded to
* `MUSTACHE_DIRS` - A `:` separated list of paths the system should look for mustache templates before using its default ones.
* `DISABLE_AUTH` - Defaults to `false` but can be `true` to make file uploading and downloading work without requiring sign in. Only recommended for development.
* `SCRIPT_NAME` - The base URL at which the app is hosted. Defaults to `""` and must not end with `/`. Usually this is set to something like `/upload`
* `DEBUG` - The loggers you want to see log output for. e.g. `express-mustache-upload,express-mustache-jwt-signin`.
* `PORT` - The port you would like the app to run on. Defaults to 80.
* `SECRET` - The secret string used to sign cookies. Make sure this is a long secret that no-one else knows, otherwise they could forge the user information in your cookies. Make sure you set the `SECRET` variable to the same value in the `signin` container too, otherwise they won't recognose each other's cookies.

## Docker Example

Make sure you have installed Docker and Docker Compose for your platform, and
that you can customise your networking so that `www.example.localhost` can
point to `127.0.0.1`.

Also, make sure you have the source code:

```
git clone https://github.com/thejimmyg/express-mustache-upload.git
cd express-mustache-upload
```

**Tip: You can also use the published docker image at https://cloud.docker.com/u/thejimmyg/repository/docker/thejimmyg/express-mustache-upload if you change the `docker-compose.yml` file to use `image: thejimmyg/express-mustache-upload:0.1.1` instead of building from source**

OK, let's begin.

For local testing, let's imagine you want to use the domain `www.example.localhost`.

You can create certificates as described here:

* https://letsencrypt.org/docs/certificates-for-localhost/

You'll need to put them in the directory `domain/www.example.localhost/sni` in this example. Here's some code that does this:

```
mkdir -p domain/www.example.localhost/sni
openssl req -x509 -out domain/www.example.localhost/sni/cert.pem -keyout domain/www.example.localhost/sni/key.pem \
  -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=www.example.localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=www.example.localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:www.example.localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
```

Now edit your `/etc/hosts` so that your domain really points to `127.0.0.1` for local testing. You should have a line that looks like this:

```
127.0.0.1	localhost www.example.localhost example.localhost
```

There is already a user file in `users/users.yaml` which the `signin` container can use. Edit it to change the usernames and passwords as you see fit.

**Tip: You can use a hased password too for the `password` field. Just visit `/user/hash` once the example is running to generarte the hash and then update the file.**

Make a directory where you can override the default templates that are in `views`:

```
mkdir -p views-upload
```

Make an `upload` directory where files will be uploaded to:

```
mkdir -p upload
```

Make sure you change the `SECRET` variable everywhere, otherwise someone could forge your cookies and gain access to your system. You must use the same value for `SECRET` in each of the containers otherwise they won't recognose each other's cookies.

You can now run the containers with:

```
npm run docker:run:local
```

Visit https://www.example.localhost/upload. You'll probably need to get your browser to accept the certficate since it is a self-signed one, then you'll be asked to sign in using the credentials in `users/users.yml`.

As long as the user you sign in with has the `admin: true` claim in the `users/users.yaml` file, you should be able to upload files.

Make any tweaks to templates in `views-upload` so that the defaults aren't affected. You can copy the defaults in the `views` directory as a starting point, but make sure you keep the same names.

If you see `Cannot GET /` it is because you visited `/` and no route is set up by default in `gateway-lite` for `/`, only `/upload` and `/user` are proxied to.

When you are finished you can stop the containers with the command below, otherwise Docker will automatically restart them each time you reboot (which is what you want in production, but perhaps not when you are developing):

```
npm run docker:stop:local
```

## Dev

```
npm install
MUSTACHE_DIRS="" DISABLE_AUTH=true SCRIPT_NAME="" DEBUG=express-mustache-upload,express-mustache-jwt-signin DIR=upload PORT=8000 SECRET='reallysecret' npm start
```

Visit http://localhost:8000.

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

## Changelog

### 0.1.2 2018-12-22

* Renamed from `express-file-uploader` to `express-mustache-uplaod` so that the project can be published on NPM
* Upgraded to `express-mustache-jwt-signin` 0.3.1 and `express-mustache-overlays` 0.3.0

### 0.1.1 2018-12-19

* Added a 500 page
* Added Docker Compose instructions
* Documented the enviroment variables
* Renamed `List` -> `Files`

### 0.1.0 2018-12-17

* Initial release
