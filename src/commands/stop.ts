import { Command } from "commander";

export const stopCommand = new Command("stop")
    .description("Stop Elo environment (Docker)")
    .action(() => {
        console.log("🛑 Stopping Elo Docker environment...");
        // TODO: Implement docker stop logic
    });
