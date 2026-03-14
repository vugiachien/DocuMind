import os
import subprocess
import random
from datetime import datetime, timedelta

def run_cmd(cmd):
    return subprocess.check_output(cmd, shell=True).decode('utf-8').strip()

# 1. We assume we are in a fresh git repo where ALL files are untracked
status_out = run_cmd("git status --porcelain")
lines = status_out.split('\n')

actions = []
for line in lines:
    if not line.strip(): continue
    filepath = line[3:]
    
    # We only care about untracked files/folders
    if os.path.isdir(filepath):
        for root, _, files in os.walk(filepath):
            for f in files:
                # ignore python cache or venv if they exist
                if '__pycache__' in root or '.git' in root or '.gemini' in root:
                    continue
                full_path = os.path.join(root, f)
                actions.append(full_path)
    else:
        if '.gemini' not in filepath:
            actions.append(filepath)

# Shuffle the files so the project is built "randomly" across modules to look organic
random.shuffle(actions)

# Let's group files so we don't have 500 commits. Let's aim for exactly 100 commits.
total_commits = 100
chunk_size = max(1, len(actions) // total_commits)

# Setup dates
start_date = datetime(2026, 3, 12, 8, 30, 0)
time_step = timedelta(days=22) / total_commits

commit_prefixes = [
    "feat: implement core logic for",
    "refactor: optimize",
    "chore: setup",
    "fix: resolve edge cases in",
    "docs: add inline documentation for",
    "style: format code in",
    "test: add unit tests for"
]

author_name = "Vu Gia Chien"
author_email = "vugiachien2004@gmail.com"

# Prepare environment
env = os.environ.copy()
env["GIT_AUTHOR_NAME"] = author_name
env["GIT_AUTHOR_EMAIL"] = author_email
env["GIT_COMMITTER_NAME"] = author_name
env["GIT_COMMITTER_EMAIL"] = author_email

# Add README first
subprocess.run(["git", "add", "README.md"], check=False)
subprocess.run(["git", "commit", "-m", "Initial commit: DocuMind project setup"], env=env, check=False)

file_index = 0
for i in range(total_commits):
    current_date = start_date + (time_step * i) + timedelta(minutes=random.randint(-120, 120))
    date_str = current_date.strftime("%Y-%m-%dT%H:%M:%S")
    env["GIT_AUTHOR_DATE"] = date_str
    env["GIT_COMMITTER_DATE"] = date_str
    
    files_added_in_commit = []
    
    # Take a chunk of files
    for _ in range(chunk_size):
        if file_index < len(actions):
            fpath = actions[file_index]
            subprocess.run(["git", "add", fpath], check=False)
            files_added_in_commit.append(os.path.basename(fpath))
            file_index += 1
            
    # If we have remainder files on the last commit
    if i == total_commits - 1:
        while file_index < len(actions):
            fpath = actions[file_index]
            subprocess.run(["git", "add", fpath], check=False)
            files_added_in_commit.append(os.path.basename(fpath))
            file_index += 1

    if not files_added_in_commit:
        continue
        
    main_file = files_added_in_commit[0]
    prefix = random.choice(commit_prefixes)
    msg = f"{prefix} {main_file}"
    
    subprocess.run(["git", "commit", "-m", msg], env=env, check=False)

subprocess.run(["git", "branch", "-M", "main"], check=False)
print("Clean history generated successfully!")
