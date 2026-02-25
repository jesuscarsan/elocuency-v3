import { Command } from "commander";
import { execSync } from "node:child_process";
import chalk from "chalk";

export const stopCommand = new Command("stop")
    .description("Stop Elo environment (Docker)")
    .action(() => {
        console.log(chalk.yellow("🛑 Stopping Elo Docker environment..."));
        try {
            execSync("docker compose -f setup/docker-compose.yml down", { stdio: "inherit" });
            console.log(chalk.green("\n✅ Elo environment stopped."));
        } catch (error) {
            console.error(chalk.red("\n❌ Failed to stop Elo environment:"), error instanceof Error ? error.message : String(error));
        }
    });
