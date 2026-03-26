import os
import re

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Dictionary of replacements (Order matters to avoid substring overlap issues)
    # We use regex with word boundaries to avoid replacing parts of other words
    replacements = {
        # Contract -> Agreement
        r'\bContract\b': 'Agreement',
        r'\bcontract\b': 'agreement',
        r'\bContracts\b': 'Agreements',
        r'\bcontracts\b': 'agreements',
        r'\bCONTRACT\b': 'AGREEMENT',
        r'\bCONTRACTS\b': 'AGREEMENTS',
        
        # Playbook -> AuditPolicy
        r'\bPlaybook\b': 'AuditPolicy',
        r'\bplaybook\b': 'audit_policy',
        r'\bPlaybooks\b': 'AuditPolicies',
        r'\bplaybooks\b': 'audit_policies',
        r'\bPLAYBOOK\b': 'AUDIT_POLICY',
        r'\bPLAYBOOKS\b': 'AUDIT_POLICIES',

        # Risk -> Finding
        r'\bRisk\b': 'Finding',
        r'\brisk\b': 'finding',
        r'\bRisks\b': 'Findings',
        r'\brisks\b': 'findings',
        r'\bRISK\b': 'FINDING',
        r'\bRISKS\b': 'FINDINGS',

        # specific camelCases
        r'\bcontractId\b': 'agreementId',
        r'\bplaybookId\b': 'auditPolicyId',
        r'\bcontractType\b': 'agreementType',
        r'\bcontractTypeId\b': 'agreementTypeId',
    }

    new_content = content
    for pattern, replacement in replacements.items():
        new_content = re.sub(pattern, replacement, new_content)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated content in: {filepath}")

def rename_file(filepath):
    dir_name = os.path.dirname(filepath)
    base_name = os.path.basename(filepath)
    
    # File name replacements
    new_name = base_name
    new_name = new_name.replace('contract', 'agreement')
    new_name = new_name.replace('playbook', 'audit_policy')
    new_name = new_name.replace('risk', 'finding')
    
    if new_name != base_name:
        new_filepath = os.path.join(dir_name, new_name)
        os.rename(filepath, new_filepath)
        print(f"Renamed file: {filepath} -> {new_filepath}")
        return new_filepath
    return filepath

def main():
    target_dir = 'backend/app'
    
    # First, rename contents
    for root, dirs, files in os.walk(target_dir):
        if '__pycache__' in root:
            continue
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                replace_in_file(filepath)

    # Second, rename files (need to do it bottom up or just collect all paths first)
    paths_to_rename = []
    for root, dirs, files in os.walk(target_dir):
        if '__pycache__' in root:
            continue
        for file in files:
            if file.endswith('.py'):
                paths_to_rename.append(os.path.join(root, file))
                
    for filepath in paths_to_rename:
        if os.path.exists(filepath):
            rename_file(filepath)

    print("Substitutions complete.")

if __name__ == "__main__":
    main()
