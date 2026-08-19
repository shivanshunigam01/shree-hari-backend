module.exports = {
  apps: [
    {
      name: "shree-hari-api",
      cwd: "/var/www/shree-hari-backend",
      script: "npx",
      args: "tsx src/index.ts",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4010,
      },
    },
  ],
};
