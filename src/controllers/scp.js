const fs = require('fs');
const path = require('path');
const multer = require('fastify-multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const Sentry = require('@sentry/node');

module.exports = (server) => {
  server.post('/scp', { preHandler: upload.single('file') }, async (req, res) => {
    const sep = path.sep;
    const file = req.file;

    try {
      const fileName = path.basename(req.body.remotePath);
      const folderPath = mkDirByPathSync(path.dirname(req.body.remotePath), true);

      fs.writeFileSync(`${folderPath}${sep}${fileName}`, file.buffer);

      res.status(200).send('success');
    } catch (error) {
      Sentry.captureMessage(`**[${req.body.env}|${req.body.host}|${req.body.pipelineId}]** ${error}`, 'error');

      res.status(500).send(error);
    }
  });

  const mkDirByPathSync = (targetDir, { isRelativeToScript = false } = {}) => {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    return targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(baseDir, parentDir, childDir);
      try {
        fs.mkdirSync(curDir, { recursive: true });
      } catch (err) {
        if (err.code === 'EEXIST') {
          return curDir;
        }

        // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
        if (err.code === 'ENOENT') {
          // Throw the original parentDir error on curDir `ENOENT` failure.
          throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
        }

        const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
        if (!caughtErr || (caughtErr && curDir === path.resolve(targetDir))) {
          throw err; // Throw if it's just the last created dir.
        }
      }

      return curDir;
    }, initDir);
  };
};
