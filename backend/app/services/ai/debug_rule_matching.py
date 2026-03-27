#!/usr/bin/env python
"""
Debug script: Visualize how audit_policy rules match to agreement sections.
Usage:
    python debug_rule_matching.py <contract_docx_path> <playbook_name>
    
Example:
    python debug_rule_matching.py ./uploads/test-agreement.docx "Erection and Supply.docx"
"""
import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from document_pipeline import DocLoader, SectionParser, EmbeddingService, MilvusVectorStore


def colorize(text, color):
    colors = {
        "red": "\033[91m", "green": "\033[92m", "yellow": "\033[93m",
        "blue": "\033[94m", "magenta": "\033[95m", "cyan": "\033[96m",
        "bold": "\033[1m", "dim": "\033[2m", "reset": "\033[0m",
    }
    return f"{colors.get(color, '')}{text}{colors['reset']}"


def score_bar(score, width=20):
    """Visual bar for similarity score."""
    filled = int(score * width)
    bar = "█" * filled + "░" * (width - filled)
    if score >= 0.6:
        return colorize(bar, "green")
    elif score >= 0.4:
        return colorize(bar, "yellow")
    else:
        return colorize(bar, "red")


def truncate(text, max_len=80):
    text = text.replace("\n", " ").strip()
    return text[:max_len] + "..." if len(text) > max_len else text


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    contract_path = Path(sys.argv[1])
    playbook_name = sys.argv[2]
    top_k = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.35

    if not contract_path.exists():
        print(f"❌ File not found: {contract_path}")
        sys.exit(1)

    # ── Load & parse agreement ──
    print(colorize("\n═══════════════════════════════════════════════════════════", "cyan"))
    print(colorize("  📄 RULE ↔ AGREEMENT MATCHING DEBUGGER", "bold"))
    print(colorize("═══════════════════════════════════════════════════════════\n", "cyan"))

    print(f"  Agreement : {colorize(str(contract_path), 'cyan')}")
    print(f"  AuditPolicy : {colorize(playbook_name, 'magenta')}")
    print(f"  Top-K    : {top_k}")
    print(f"  Threshold: {threshold}\n")

    loader = DocLoader()
    parser = SectionParser()
    embedder = EmbeddingService()

    paragraphs = loader.load(contract_path)
    sections = parser.parse(paragraphs)
    valid_sections = [s for s in sections if s.text.strip()]

    print(f"  📑 Parsed {colorize(str(len(valid_sections)), 'bold')} agreement sections\n")

    # ── Connect to Milvus ──
    store = MilvusVectorStore(
        collection_name="knowledge_base",
        embedding_dim=embedder.dimension,
        uri=os.getenv("MILVUS_URI"),
    )
    store.collection.load()

    # ── Check audit_policy exists ──
    filter_expr = f"document_id == '{playbook_name}'"
    rule_count = store.collection.query(expr=filter_expr, output_fields=["chunk_id"], limit=1)
    if not rule_count:
        print(colorize(f"  ❌ No rules found for audit_policy '{playbook_name}' in Milvus!", "red"))
        print(colorize("     → Re-ingest the audit_policy first.\n", "dim"))
        sys.exit(1)

    # ── Match each section ──
    print(colorize("───────────────────────────────────────────────────────────", "dim"))
    print(colorize("  MATCHING RESULTS", "bold"))
    print(colorize("───────────────────────────────────────────────────────────\n", "dim"))

    total_matches = 0
    all_matches = []

    for section in valid_sections:
        search_results = store.search(
            query=section.text[:1000],
            embedder=embedder,
            limit=top_k,
            filter_expression=filter_expr,
            output_fields=["document_id", "section_id", "metadata_json", "chunk_text"],
        )

        if not search_results or not search_results[0]:
            continue

        section_header = f"📌 Section [{section.section_id}] {section.title}"
        print(colorize(section_header, "bold"))
        print(colorize(f"   Content: {truncate(section.text, 100)}", "dim"))
        print()

        has_match = False
        for hit in search_results[0]:
            score = float(hit.distance)
            rule_sid = hit.entity.get("section_id", "?")
            raw_meta = hit.entity.get("metadata_json", "")
            chunk_text = hit.entity.get("chunk_text", "")
            metadata = {}
            if raw_meta:
                try:
                    metadata = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
                except:
                    pass
            rule_title = metadata.get("section_title", f"Rule {rule_sid}")

            above = score >= threshold
            marker = colorize("✅", "green") if above else colorize("❌", "red")
            score_str = f"{score:.4f}"
            if above:
                score_str = colorize(score_str, "green")
            else:
                score_str = colorize(score_str, "red")

            print(f"   {marker} Rule [{rule_sid}] {colorize(rule_title, 'magenta')}")
            print(f"      Score: {score_str}  {score_bar(score)}")
            if chunk_text:
                print(f"      Text : {colorize(truncate(chunk_text, 100), 'dim')}")
            else:
                print(f"      Text : {colorize('(not stored in Milvus)', 'red')}")
            print()

            if above:
                has_match = True
                total_matches += 1
                all_matches.append({
                    "section_id": section.section_id,
                    "section_title": section.title,
                    "rule_sid": rule_sid,
                    "rule_title": rule_title,
                    "score": score,
                    "has_text": bool(chunk_text),
                })

        if not has_match:
            print(colorize("   (no matches above threshold)\n", "dim"))

        print(colorize("   · · · · · · · · · · · · · · · · · · · · · · · · · · · ·\n", "dim"))

    # ── Summary ──
    print(colorize("═══════════════════════════════════════════════════════════", "cyan"))
    print(colorize("  SUMMARY", "bold"))
    print(colorize("═══════════════════════════════════════════════════════════\n", "cyan"))

    print(f"  Total agreement sections : {len(valid_sections)}")
    print(f"  Total matches (≥{threshold})  : {colorize(str(total_matches), 'green' if total_matches > 0 else 'red')}")
    text_count = sum(1 for m in all_matches if m["has_text"])
    print(f"  Matches with rule text  : {colorize(str(text_count), 'green' if text_count > 0 else 'red')}/{total_matches}")
    print()

    if all_matches:
        print(colorize("  Match Map:", "bold"))
        for m in all_matches:
            arrow = colorize("←→", "yellow")
            print(
                f"    Agreement [{m['section_id']}] {m['section_title'][:30]:30s} "
                f"{arrow} Rule [{m['rule_sid']}] {m['rule_title'][:30]:30s} "
                f"({m['score']:.3f})"
            )
        print()

    if text_count == 0 and total_matches > 0:
        print(colorize("  ⚠️  Rule text is empty! You need to:", "yellow"))
        print(colorize("     1. Drop the old Milvus collection", "yellow"))
        print(colorize("     2. Re-ingest the audit_policy", "yellow"))
        print()


if __name__ == "__main__":
    main()
