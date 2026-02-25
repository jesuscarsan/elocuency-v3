import os
import shutil
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from src.application.use_cases.ask_ai_use_case import AskAIUseCase

logger = logging.getLogger(__name__)

class TaskWatcherService:
    def __init__(self, ask_ai_use_case: AskAIUseCase, workspace_path: str, interval_seconds: int = 30):
        self.ask_ai_use_case = ask_ai_use_case
        self.task_dir = Path(workspace_path) / "tasks"
        self.todo_dir = self.task_dir / "todo"
        self.in_progress_dir = self.task_dir / "in-progress"
        self.done_dir = self.task_dir / "done"
        self.error_dir = self.task_dir / "error"
        self.human_required_dir = self.task_dir / "human-required"
        self.interval_seconds = interval_seconds
        self.is_running = False
        self._task = None

        # Ensure directories exist
        for d in [self.todo_dir, self.in_progress_dir, self.done_dir, self.error_dir, self.human_required_dir]:
            d.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _set_blocked_by(content: str, note_name: str) -> str:
        import re
        fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if fm_match:
            fm = fm_match.group(1)
            body = content[fm_match.end():]
            if "blocked_by:" in fm:
                fm = re.sub(r"^blocked_by:.*$", f"blocked_by: {note_name}", fm, flags=re.MULTILINE)
            else:
                fm += f"\nblocked_by: {note_name}"
            return f"---\n{fm}\n---\n{body}"
        else:
            return f"---\nblocked_by: {note_name}\n---\n\n{content}"

    @staticmethod
    def _get_blocked_by(content: str) -> str | None:
        import re
        fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if fm_match:
            fm = fm_match.group(1)
            match = re.search(r"^blocked_by:\s*(.+)$", fm, flags=re.MULTILINE)
            if match:
                return match.group(1).strip()
        return None

    @staticmethod
    def _remove_blocked_by(content: str) -> str:
        import re
        fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
        if fm_match:
            fm = fm_match.group(1)
            body = content[fm_match.end():]
            fm = re.sub(r"^blocked_by:.*$\n?", "", fm, flags=re.MULTILINE)
            if fm.strip():
                return f"---\n{fm.strip()}\n---\n{body}"
            else:
                return body.lstrip()
        return content

    async def start(self):
        """Starts the background task watcher."""
        if self.is_running:
            return
        
        self.is_running = True
        
        # Recover stranded tasks from in-progress
        await self._recover_in_progress_tasks()
        
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"TaskWatcherService started. Monitoring {self.todo_dir}")

    async def _recover_in_progress_tasks(self):
        """Moves tasks from in-progress back to todo on startup, unless they are blocked."""
        try:
            stranded_files = list(self.in_progress_dir.glob("*.md"))
            if stranded_files:
                logger.info(f"Checking {len(stranded_files)} tasks in in-progress on startup.")
                for f in stranded_files:
                    try:
                        with open(f, "r") as file_obj:
                            content = file_obj.read()
                        
                        if self._get_blocked_by(content):
                            # It's waiting on a human, leave it here
                            continue

                        target = self.todo_dir / f.name
                        shutil.move(str(f), str(target))
                        logger.info(f"Moved stranded task {f.name} back to todo.")
                    except Exception as e:
                        logger.error(f"Error checking stranded task {f.name}: {e}")
        except Exception as e:
            logger.error(f"Error recovering stranded tasks: {e}")

    async def stop(self):
        """Stops the background task watcher."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("TaskWatcherService stopped.")

    async def _run_loop(self):
        while self.is_running:
            try:
                await self.process_tasks()
            except Exception as e:
                logger.error(f"Error in TaskWatcherService loop: {e}", exc_info=True)
            
            await asyncio.sleep(self.interval_seconds)

    async def process_tasks(self):
        """Scans the directories and processes tasks."""
        # 1. Check blocked tasks in in-progress
        await self._check_blocked_tasks()

        # 2. Process new tasks in todo
        # Skip files that are notes for humans
        files = [f for f in self.todo_dir.glob("*.md") if not f.name.startswith("HUMAN_NEED_HELP_")]
        if not files:
            return

        logger.info(f"Found {len(files)} tasks to process.")
        for task_file in files:
            await self._process_file(task_file)

    async def _check_blocked_tasks(self):
        """Checks if tasks blocked by humans are ready to resume."""
        blocked_files = list(self.in_progress_dir.glob("*.md"))
        for f in blocked_files:
            try:
                with open(f, "r") as file_obj:
                    content = file_obj.read()
                
                blocked_by = self._get_blocked_by(content)
                if not blocked_by:
                    continue
                
                # Check if the human-required note still exists
                note_file = self.human_required_dir / blocked_by
                if not note_file.exists():
                    logger.info(f"Dependency {blocked_by} resolved for {f.name}. Resuming task.")
                    # Human resolved it
                    new_content = self._remove_blocked_by(content)
                    
                    # Move it back to todo to process normally
                    target = self.todo_dir / f.name
                    with open(target, "w") as out:
                        out.write(new_content)
                        
                    f.unlink()
            except Exception as e:
                 logger.error(f"Error checking blocked task {f.name}: {e}")

    async def _process_file(self, task_file: Path):
        in_progress_file = self.in_progress_dir / task_file.name
        try:
            logger.info(f"Processing task: {task_file.name}")
            
            # Move to in-progress
            shutil.move(str(task_file), str(in_progress_file))
            
            with open(in_progress_file, "r") as f:
                content = f.read()

            if not content.strip():
                logger.warning(f"Task file {task_file.name} is empty. Skipping.")
                in_progress_file.unlink()
                return

            # Execute AI task
            response = await self.ask_ai_use_case.execute(content, user_id="background_task_worker")

            # Check if delegated (either via tool return or via string detection in response)
            is_delegated = "DELEGATED_TO_HUMAN:" in response or "delegate_to_human(" in response
            
            if is_delegated:
                # Try to extract reason from either format
                if "DELEGATED_TO_HUMAN:" in response:
                    reason = response.split("DELEGATED_TO_HUMAN:")[1].split("\n")[0].strip()
                else:
                    # Fallback for hallucinated calls like delegate_to_human(reason='...')
                    import re
                    match = re.search(r"delegate_to_human\((?:reason=)?['\"](.*?)['\"]\)", response)
                    reason = match.group(1) if match else "Requested delegation to human."
                
                logger.info(f"Task {task_file.name} was delegated to human. Reason: {reason}")
                
                # 1. Create a "Help Note" for the human in the human-required folder
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                help_note_name = f"HUMAN_NEED_HELP_{timestamp}_{task_file.stem}.md"
                help_note_path = self.human_required_dir / help_note_name
                
                help_content = f"# Help Requested\n\n**Task:** {task_file.name}\n**Reason:** {reason}\n\n---\n*Please provide instructions or fix the issue, then remove this note and update the original task.*"
                with open(help_note_path, "w") as f:
                    f.write(help_content)

                # 2. Add blocked_by frontmatter and keep in in-progress
                delegated_content = self._set_blocked_by(content, help_note_name)
                
                with open(in_progress_file, "w") as f:
                    f.write(delegated_content)
                
                logger.info(f"Task {task_file.name} is now blocked by {help_note_name}. Left in in-progress.")
                return

            # Prepare result content
            result_content = content + "\n\n---\n\n## AI Response\n\n" + response + "\n\n*Processed at: " + datetime.now().isoformat() + "*"

            # Move to done
            done_file = self.done_dir / task_file.name
            with open(done_file, "w") as f:
                f.write(result_content)
            
            in_progress_file.unlink()
            logger.info(f"Task {task_file.name} completed successfully.")

        except Exception as e:
            logger.error(f"Failed to process task {task_file.name}: {e}", exc_info=True)
            # Move to error
            error_file = self.error_dir / task_file.name
            try:
                # If it was already moved to in-progress, read from there
                actual_file = in_progress_file if in_progress_file.exists() else task_file
                
                with open(actual_file, "r") as f:
                    content = f.read()
                
                with open(error_file, "w") as f:
                    f.write(content + "\n\n---\n\n## Error\n\n" + str(e))
                
                if actual_file.exists():
                    actual_file.unlink()
            except Exception as e2:
                logger.error(f"Critical error moving task to error dir: {e2}")
