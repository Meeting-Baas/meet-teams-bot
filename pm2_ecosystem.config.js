// PM2 Ecosystem Configuration for 3 Meeting Bots
// Run with: pm2 start pm2_ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'meeting-bot-1',
      script: 'recording_server/build/src/main.js',
      cwd: '/home/ubuntu/meet-teams-bot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        SERVERLESS: 'true',
        DISPLAY: ':99',
        CAMERA: '/dev/video0',
        PORT: '3001',
        BOT_ID: '1',
        BOT_NAME: 'Ducobu Bot 1',
        NIX_LD_LIBRARY_PATH: process.env.NIX_LD_LIBRARY_PATH,
        NIX_LD: process.env.NIX_LD
      },
      error_file: '~/monitoring/logs/bot1-error.log',
      out_file: '~/monitoring/logs/bot1-out.log',
      log_file: '~/monitoring/logs/bot1-combined.log',
      time: true
    },
    {
      name: 'meeting-bot-2', 
      script: 'recording_server/build/src/main.js',
      cwd: '/home/ubuntu/meet-teams-bot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        SERVERLESS: 'true',
        DISPLAY: ':100',
        CAMERA: '/dev/video1', 
        PORT: '3002',
        BOT_ID: '2',
        BOT_NAME: 'Ducobu Bot 2',
        NIX_LD_LIBRARY_PATH: process.env.NIX_LD_LIBRARY_PATH,
        NIX_LD: process.env.NIX_LD
      },
      error_file: '~/monitoring/logs/bot2-error.log',
      out_file: '~/monitoring/logs/bot2-out.log', 
      log_file: '~/monitoring/logs/bot2-combined.log',
      time: true
    },
    {
      name: 'meeting-bot-3',
      script: 'recording_server/build/src/main.js', 
      cwd: '/home/ubuntu/meet-teams-bot',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        SERVERLESS: 'true',
        DISPLAY: ':101',
        CAMERA: '/dev/video2',
        PORT: '3003', 
        BOT_ID: '3',
        BOT_NAME: 'Ducobu Bot 3',
        NIX_LD_LIBRARY_PATH: process.env.NIX_LD_LIBRARY_PATH,
        NIX_LD: process.env.NIX_LD
      },
      error_file: '~/monitoring/logs/bot3-error.log',
      out_file: '~/monitoring/logs/bot3-out.log',
      log_file: '~/monitoring/logs/bot3-combined.log', 
      time: true
    }
  ]
}; 