const { NodeSSH } = require("node-ssh");
const ssh = new NodeSSH();
const path = require("path");
const Sentry = require("@sentry/node");

module.exports = (server) => {
  const logError = (req, res, error) => {
    Sentry.captureMessage(
      `**[${req.body.env}|${req.body.host}|${req.body.jobid}]** ${error}`,
      "error"
    );
    res.status(500).send(error);
  };

  const handleResult = (req, res, result, callback) => {
    if (result.stderr) {
      if (result.stderr.includes("WARNING")
        || result.stderr.includes("Error: No such")) {
        res.status(200).send(result.stderr);
        return;
      }

      logError(req, res, result.stderr);
    } else {
      if (callback) {
        callback(result.stdout);
      } else {
        res.status(200).send(result.stdout);
      }
    }
  };

  const createConnectionOption = (req) => {
    return {
      host: req.body.host,
      port: req.body.port ?? 22,
      username: req.body.user ?? "root",
      privateKey: path.join(__dirname, "../id_rsa"),
    };
  };

  const runRemoteCommands = (commands, req, res, callback) => {
    const connectionOpts = createConnectionOption(req);

    ssh
      .connect(connectionOpts)
      .then(() => {
        ssh
          .execCommand(commands)
          .then((result) => {
            handleResult(req, res, result, callback);
          })
          .catch((error) => {
            logError(req, res, error);
          });
      })
      .catch((error) => {
        logError(req, res, error);
      });
  };

  const removeConfig = (configs) => {
    const params = configs?.replace("\r\n", " ").replace("\n", " ");
    const commands = `docker config rm ${params}`;

    runRemoteCommands(commands, req, res);
  };

  server.post("/config/remove", (req, res) => {
    const filter = req.body.configName?.replace(" ", "");
    const commands = `docker config ls --format {{.Name}} | grep -e ${filter}*`;

    runRemoteCommands(commands, req, res, (result) => {
      removeConfig(result);
    });
  });
};
