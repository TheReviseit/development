import re

# Read the file
with open('ai_brain/ai_brain.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with "if msg_lower.startswith("order "):"
insert_index = None
for i, line in enumerate(lines):
    if 'if msg_lower.startswith("order "):' in line:
        insert_index = i
        break

if insert_index is None:
    print("ERROR: Could not find insertion point")
    exit(1)

# Find where to insert (after raw_term extraction)
for i in range(insert_index, min(insert_index + 20, len(lines))):
    if 'raw_term = msg_lower.replace("order ", "").strip()' in lines[i]:
        # Insert card_index lookup after this line
        insert_pos = i + 1
        
        # Insert the new code (not using f-strings to avoid escaping issues)
        new_lines = [
            "            \n",
            "            # CRITICAL FIX: Check if this is the new card_index format (order_card_0, order_card_1, etc.)\n",
            '            if raw_term.startswith("card_"):\n',
            "                try:\n",
            '                    # Extract card index from "card_0", "card_1", etc.\n',
            '                    card_index = int(raw_term.replace("card_", ""))\n',
            '                    card_index_map = state.collected_fields.get("_card_index_map", {})\n',
            "                    \n",
            '                    logger.info(f"🗺️ Card-based button detected: {raw_term}, card_index={card_index}")\n',
            '                    logger.info(f"🗺️ Card index map has {len(card_index_map)} entries")\n',
            "                    \n",
            "                    # Look up the full product_id using the card_index\n",
            "                    # Convert string keys to int if needed\n",
            "                    card_index_map_int = {int(k) if isinstance(k, str) else k: v for k, v in card_index_map.items()}\n",
            "                    \n",
            "                    if card_index in card_index_map_int:\n",
            "                        full_product_id = card_index_map_int[card_index]\n",
            '                        logger.info(f"✅ Mapped card_index {card_index} → product_id: {full_product_id}")\n',
            "                        \n",
            "                        # Override raw_term to use the full product ID\n",
            "                        raw_term = full_product_id.lower()\n",
            '                        logger.info(f"🔄 Using mapped product_id for matching: raw=\'{raw_term}\'")\n',
            "                    else:\n",
            '                        logger.warning(f"⚠️ Card index {card_index} not found in map! Available: {list(card_index_map_int.keys())}")\n',
            "                except (ValueError, TypeError) as e:\n",
            '                    logger.error(f"❌ Failed to parse card index from \'{raw_term}\': {e}")\n',
            "            \n",
        ]
        
        for line in reversed(new_lines):
            lines.insert(insert_pos, line)
        break

# Write back
with open('ai_brain/ai_brain.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("✅ Successfully added card_index lookup code")
