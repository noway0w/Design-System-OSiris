const path = require('path');

module.exports = {
  port: parseInt(process.env.CFD_PORT, 10) || 8090,
  casesDir: path.join(__dirname, 'cases'),
  templateDir: path.join(__dirname, 'templates', 'cavity'),
  scriptDir: path.join(__dirname, 'scripts'),
  useDocker: process.env.CFD_USE_DOCKER === '1' || process.env.CFD_USE_DOCKER === 'true',
  dockerImage: process.env.CFD_DOCKER_IMAGE || 'opencfd/openfoam-default'
};
