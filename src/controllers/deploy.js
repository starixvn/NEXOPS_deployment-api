const { exec } = require("child_process");
const Sentry = require("@sentry/node");
const multer = require('fastify-multer');
const { URL } = require("url");
const upload = multer();

module.exports = (server) => {
  const logError = (request, response, error) => {
    const errorMessage = `**[eks/k8s][${request.body.env}|${request.body.pipelineId}]** ${error}`;
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

  const replaceSpaces = (content) => content?.replace(/\s/g, "");

  const normalize = (content) => {
    let result = content;

    if (content) {
      result = replaceSpaces(content).replace(/_/g, "-").toLowerCase();
    }

    return result;
  }

  const execCommands = (commands, request, response, callback) => {
    exec(commands, (error, stdout, stderr) => {
      if (error) {
        logError(request, response, error);
      } else {
        handleResult(request, response, { stdout, stderr }, callback);
      }
    });
  };

  server.post("/deployKubernetes", { preHandler: upload.none() }, (request, response) => {
    const releaseName = normalize(request.body.releaseName),
      workingDirectory = replaceSpaces(request.body.workingDirectory),
      env = replaceSpaces(request.body.env),
      chartBaseUrl = replaceSpaces(request.body.chartBaseUrl),
      registryUrl = new URL(chartBaseUrl).host,
      user = replaceSpaces(request.body.registryUser),
      password = replaceSpaces(request.body.registryPassword),
      configFileName = replaceSpaces(request.body.configFileName),
      spFileName = replaceSpaces(request.body.spFileName),
      historyMax = "--history-max 5";

    let commands = `helm registry login -u ${user} -p ${password} ${registryUrl}`;
    commands = `${commands} && helm upgrade -i imagepullsecrets ${chartBaseUrl}/imagepullsecrets ${historyMax} --set imageCredentials.registry=${chartBaseUrl} --set imageCredentials.username=${user} --set imageCredentials.password=${password}`;
    commands = `${commands} && cd ${workingDirectory}/${env} && helm upgrade -i ${releaseName} ${chartBaseUrl}/k8sdeployments ${historyMax} -f k8sdeployments-values.yaml`;

    if (configFileName) {
      commands = `${commands} --set-file "configFile.content=${configFileName}"`;
    }

    if (spFileName) {
      commands = `${commands} --set-file "spFile.content=${spFileName}"`;
    }

    execCommands(commands, request, response);
  });
};
