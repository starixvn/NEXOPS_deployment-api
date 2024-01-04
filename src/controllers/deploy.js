const { NodeSSH } = require("node-ssh");
const ssh = new NodeSSH();
const path = require("path");
const Sentry = require("@sentry/node");
const multer = require('fastify-multer');
const upload = multer();

module.exports = (server) => {
  const logError = (request, response, error) => {
    const errorMessage = `**[${request.body.env}|${request.body.host}|${request.body.pipelineId}]** ${error}`;
    Sentry.captureMessage(errorMessage, "error");
    console.log(errorMessage);
    response.status(500).send(error);
  };

  const handleResult = (request, response, result, callback) => {
    if (result.stderr) {
      if ((result.stderr.includes("WARNING") && !result.stderr.includes("Error"))
        || result.stderr.includes("Error: No such")
        || (result.stderr.includes("Pulled") && !result.stderr.includes("Error"))) {
        response.status(200).send(`${result.stderr}\n${result.stdout}`);
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
      readyTimeout: 90000
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
    const params = configs?.replace(/\r\n/g, " ").replace(/\n/g, " ");
    const commands = `docker config rm ${params}`;

    runRemoteCommands(commands, request, response);
  };

  const replaceSpaces = (content) => content?.replace(/\s/g, "");

  const normalize = (content) => {
    let result = content;

    if (content) {
      result = replaceSpaces(content).replace(/_/g, "-").toLowerCase();
    }

    return result;
  }

  server.post("/removeSwarmConfigs", { preHandler: upload.none() }, (request, response) => {
    const filter = replaceSpaces(request.body.configName);
    const commands = `docker config ls --format {{.Name}} | grep -e ${filter}*`;

    runRemoteCommands(commands, request, response, (result) => {
      removeConfig(result, request, response);
    });
  });

  server.post("/loginRegistry", { preHandler: upload.none() }, (request, response) => {
    const user = replaceSpaces(request.body.registryUser),
      password = replaceSpaces(request.body.registryPassword),
      url = replaceSpaces(request.body.registryUrl);
    const commands = `docker login -u ${user} -p ${password} ${url}`;

    runRemoteCommands(commands, request, response);
  });

  server.post("/prepareFolderPermission", { preHandler: upload.none() }, (request, response) => {
    const user = replaceSpaces(request.body.user),
      workingDirectory = replaceSpaces(request.body.workingDirectory),
      env = replaceSpaces(request.body.env);
    const commands = `sudo mkdir -p ${workingDirectory}/${env}/configs && sudo chown ${user}:${user} -R ${workingDirectory} && sudo chmod 755 -R ${workingDirectory}`;

    runRemoteCommands(commands, request, response);
  });

  server.post("/deploySwarmService", { preHandler: upload.none() }, (request, response) => {
    const stack = replaceSpaces(request.body.stack),
      workingDirectory = replaceSpaces(request.body.workingDirectory),
      env = replaceSpaces(request.body.env);
    const commands = `cd ${workingDirectory}/${env} && docker stack deploy --compose-file=docker-compose.yml --with-registry-auth ${stack}`;

    runRemoteCommands(commands, request, response);
  });

  server.post("/loginChartRegistry", { preHandler: upload.none() }, (request, response) => {
    const user = replaceSpaces(request.body.registryUser),
      password = replaceSpaces(request.body.registryPassword),
      url = replaceSpaces(request.body.registryUrl);
    const commands = `helm registry login -u ${user} -p ${password} ${url}`;

    runRemoteCommands(commands, request, response);
  });

  server.post("/deployKubernetes", { preHandler: upload.none() }, (request, response) => {
    const releaseName = normalize(request.body.releaseName),
      workingDirectory = replaceSpaces(request.body.workingDirectory),
      env = replaceSpaces(request.body.env),
      chartBaseUrl = replaceSpaces(request.body.chartBaseUrl),
      user = replaceSpaces(request.body.registryUser),
      password = replaceSpaces(request.body.registryPassword),
      configFileName = replaceSpaces(request.body.configFileName),
      spFileName = replaceSpaces(request.body.spFileName),
      historyMax = "--history-max 5";

    let commands = `helm upgrade -i imagepullsecrets ${chartBaseUrl}/imagepullsecrets ${historyMax} --set imageCredentials.registry=${chartBaseUrl} --set imageCredentials.username=${user} --set imageCredentials.password=${password}`;
    commands = `${commands} && cd ${workingDirectory}/${env} && helm upgrade -i ${releaseName} ${chartBaseUrl}/k8sdeployments ${historyMax} -f k8sdeployments-values.yaml`;

    if (configFileName) {
      commands = `${commands} --set-file "configFile.content=${configFileName}"`;
    }

    if (spFileName) {
      commands = `${commands} --set-file "spFile.content=${spFileName}"`;
    }

    runRemoteCommands(commands, request, response);
  });
};
