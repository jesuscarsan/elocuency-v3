import { Command } from "commander";

export const startCommand = new Command("start")
    .description("Launch Elo environment (Docker or Dev)")
    .option("-d, --dev", "Launch in development mode instead of Docker production mode")
    .action((options) => {
        if (options.dev) {
            console.log("🚀 Starting Elo in DEVELOPMENT mode...");
            // TODO: Implement dev start logic
        } else {
            console.log("🐳 Starting Elo in DOCKER mode...");
            // TODO: Implement docker start logic
        }
    });
