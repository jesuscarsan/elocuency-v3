import { Command } from "commander";
import { execSync } from "node:child_process";
import chalk from "chalk";

export const startCommand = new Command("start")
    .description("Launch Elo environment (Docker or Dev)")
    .option("-d, --dev", "Launch in development mode instead of Docker production mode")
    .action((options) => {
        if (options.dev) {
            console.log(chalk.cyan("🚀 Starting Elo in DEVELOPMENT mode..."));
            // TODO: Implement dev start logic
        } else {
            console.log(chalk.blue("🐳 Starting Elo in DOCKER mode..."));
            try {
                execSync("docker compose -f setup/docker-compose.yml up -d", { stdio: "inherit" });
                console.log(chalk.green("\n✅ Elo environment is starting up!"));
            } catch (error) {
                console.error(chalk.red("\n❌ Failed to start Elo environment:"), error instanceof Error ? error.message : String(error));
            }
        }
    });
