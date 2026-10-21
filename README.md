# BOSH Ads Optimizer dashboard

The sign-in page for BOSH Chemical's Ads Optimizer. This repository holds **only the page**: no data, no
secrets. Every number is read after sign-in from a private database that checks, on every row, that the
signed-in person is the owner. The key in `config.js` is a publishable key: on its own it can read nothing.

Source, tests and the nightly pipeline live in a private repository.
