const { NodeSSH } = require("node-ssh");
const ssh = new NodeSSH();
const path = require("path");
const Sentry = require("@sentry/node");

module.exports = (server) => {
  const logError = (request, response, error) => {
    Sentry.captureMessage(
      `**[${request.body.env}|${request.body.host}|${request.body.jobid}]** ${error}`,
      "error"
    );
    response.status(500).send(error);
  };

  const handleResult = (request, response, result, callback) => {
    if (result.stderr) {
      if (result.stderr.includes("WARNING")
        || result.stderr.includes("Error: No such")) {
        response.status(200).send(result.stderr);
        return;
      }

      logError(request, response, result.stderr);
    } else {
      if (callback) {
        callback(result.stdout);
      } else {
        response.status(200).send(result.stdout);
      }
    }
  };

  const createConnectionOption = (request) => {
    return {
      host: request.body.host,
      port: request.body.port ?? 22,
      username: request.body.user ?? "root",
      privateKey: path.join(__dirname, "../id_rsa"),
    };
  };

  const runRemoteCommands = (commands, request, response, callback) => {
    const connectionOpts = createConnectionOption(request);

    ssh
      .connect(connectionOpts)
      .then(() => {
        ssh
          .execCommand(commands)
          .then((result) => {
            handleResult(request, response, result, callback);
          })
          .catch((error) => {
            logError(request, response, error);
          });
      })
      .catch((error) => {
        logError(request, response, error);
      });
  };

  const removeConfig = (configs, request, response) => {
    const params = configs?.replace("\r\n", " ").replace("\n", " ");
    const commands = `docker config rm ${params}`;

    runRemoteCommands(commands, request, response);
  };

  server.post("/config/remove", (request, response) => {
    const filter = request.body.configName?.replace(" ", "");
    const commands = `docker config ls --format {{.Name}} | grep -e ${filter}*`;

    runRemoteCommands(commands, request, response, (result) => {
      removeConfig(result, request, response);
    });
  });
};
