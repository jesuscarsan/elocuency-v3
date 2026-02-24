import { Command } from 'commander';
import * as crypto from 'node:crypto';
import chalk from 'chalk';

export const authCommand = new Command('auth').description('Authentication utilities');

authCommand
	.command('generate')
	.description('Generate a secure, random authentication token for the Elo Server')
	.action(() => {
		// Generate a 32-byte (64-character hex) random token
		const token = crypto.randomBytes(32).toString('hex');

		console.log(chalk.green('\n✅ Secure Token Generated:\n'));
		console.log(chalk.bold.cyan(token));
		console.log('\n');
		console.log(chalk.yellow('Instructions:'));
		console.log(`1. Copy this token.`);
		console.log(`2. Paste it into your ${chalk.bold('apps/elo-server/.env')} file like this:`);
		console.log(chalk.dim(`   SERVER_AUTH_TOKEN=${token}`));
		console.log(`3. Restart your server for the changes to take effect.`);
		console.log(
			`4. Use this token as an ${chalk.bold('Authorization: Bearer <TOKEN>')} header or ${chalk.bold('X-API-Key: <TOKEN>')} header in your API requests.\n`,
		);
	});
