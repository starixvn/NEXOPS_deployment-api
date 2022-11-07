const authTokens = ['64E97A7A53B4E48B6631DFF184CC6', '6fEU6E8XbPoXBzTEGsefpfgCFgvIUSyM'];

module.exports = (server) => {
  server.addHook('onRequest', (request, reply, done) => {
    const token = request.query.token;

    if (authTokens.indexOf(token) == -1 && request.method == 'POST') {
      reply.status(401).send();
    }

    done();
  });
};
