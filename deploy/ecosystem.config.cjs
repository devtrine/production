module.exports = {
  apps: [
    {
      name: 'biensi-backend',
      cwd: './biensi_be',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
