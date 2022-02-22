module.exports = (server) => {
  server.get('/', (req, res) => {
    res.send('Deployment API is running!');
  });
  server.get('/whoami', function (req, res) {
    //var ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress
    const parseIp = (req) =>
    req.headers['x-forwarded-for']?.split(',').shift()
    || req.socket?.remoteAddress
    res.send("Hello! It's me " + parseIp(req));
})
};
