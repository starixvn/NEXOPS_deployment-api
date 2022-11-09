const scp = require('./scp');
const auth = require('./auth');
const home = require('./home');
const deploy = require('./deploy');

module.exports = {
  home,
  auth,
  scp,
  deploy
};
