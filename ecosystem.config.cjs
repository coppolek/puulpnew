// PM2 Ecosystem Configuration for Hostinger VPS
// Start with: pm2 start ecosystem.config.cjs --env production
// View logs: pm2 logs puulp-it
// Restart:   pm2 restart puulp-it

module.exports = {
  apps: [
    {
      name: 'puulp-it',
      script: 'dist/server.js',
      instances: 'max', // or 1 for modest VPS plans (1GB/2GB RAM)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
};
