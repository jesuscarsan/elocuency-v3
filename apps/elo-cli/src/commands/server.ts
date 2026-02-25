import { Command } from "commander";
import { startCommand } from "./start.js";
import { stopCommand } from "./stop.js";

export const serverCommand = new Command("server")
    .description("Manage Elo server environment")
    .addCommand(startCommand)
    .addCommand(stopCommand);
