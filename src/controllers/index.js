const command = require('./command');
const exec = require('./exec');
const scp = require('./scp');
const auth = require('./auth');
const home = require('./home');

module.exports = {
  home,
  auth,
  command,
  exec,
  scp,
};
