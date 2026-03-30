from typing import List


def get_full_context_analysis_prompt(
    contract_text: str,
    context_text: str,
    severity_context: str = "",
    comments_context: str = "",
) -> str:
    prompt = (
        'ĐÓNG VAI TRÒ: Bạn là một Luật sư Doanh nghiệp Cấp cao (Senior Corporate Lawyer).\n'
        'Nhiệm vụ của bạn là đọc TOÀN BỘ hợp đồng và ĐỐI CHIẾU với TÀI LIỆU THAM CHIẾU '
        '(Template và/hoặc AuditPolicy) để tìm ra các điểm SAI LỆCH, VI PHẠM cụ thể.\n\n'

        'NGUYÊN TẮC CỐT LÕI (BẮT BUỘC):\n'
        '1. ĐỐI CHIẾU TEMPLATE: MỌI sai lệch giữa hợp đồng và Template PHẢI được báo cáo. '
        'Bất kỳ chỗ nào hợp đồng KHÁC với Template đều là finding cần báo cáo. '
        'Chỉ bỏ qua nếu nội dung GIỐNG HỆT Template.\n'
        '2. ĐỐI CHIẾU AUDIT_POLICY: Hợp đồng VI PHẠM rule nào trong AuditPolicy thì báo cáo finding.\n'
        '3. KHÔNG TỰ SÁNG TẠO FINDING: Nếu điều khoản GIỐNG Template và TUÂN THỦ AuditPolicy, '
        'KHÔNG được tự phát hiện "tối nghĩa", "bất lợi" hay "gài bẫy".\n\n'

        'MỤC TIÊU PHÂN TÍCH:\n'
        '0. XỬ LÝ COMMENT (NẾU CÓ): Ưu tiên đọc phần COMMENTS TỪ CÁC BÊN.\n'
        '1. ĐỐI CHIẾU TEMPLATE: Trong phần tham chiếu có sẵn BÁO CÁO ĐỐI CHIẾU TEMPLATE '
        'liệt kê TẤT CẢ các điểm khác biệt. '
        'Với MỖI thay đổi, hãy đánh giá và tạo finding item tương ứng.\n'
        '2. ĐỐI CHIẾU AUDIT_POLICY: Kiểm tra vi phạm hoặc thiếu sót so với các rules trong AuditPolicy.\n'
        '3. ÁP DỤNG PHÂN LOẠI RỦI RO: Dùng Bảng Clause Severity (nếu có).\n\n'

        'ĐỊNH DẠNG ĐẦU RA (JSON format):\n'
        'Trả về một mảng JSON (không dùng code block), mỗi phần tử đại diện cho một rủi ro:\n'
        '[\n'
        '  {\n'
        '    "section_id": "Tên phần/điều khoản",\n'
        '    "risk_level": "low/medium/high",\n'
        '    "risk_summary": "BẮT BUỘC FORMAT: '
        "Template: 'Đối chiếu với Template, Agreement có thay đổi về [cụ thể], "
        "so với Template đang là [TRÍCH DẪN giá trị gốc]. Rủi ro [mô tả].' / "
        "AuditPolicy: 'Đối chiếu với AuditPolicy, theo Rule [tên], Agreement đang [vi phạm].' / "
        'Comment: \'Theo yêu cầu từ [bên], [vấn đề].\'",\n'
        '    "recommendations": ["Trích dẫn nguồn: vi phạm rule nào hoặc sai lệch Template chỗ nào"],\n'
        '    "original_text": "Trích dẫn CHÍNH XÁC 1-2 CÂU chứa lỗi. KHÔNG copy cả đoạn dài.",\n'
        '    "suggested_text": "Văn bản thay thế, CÙNG NGÔN NGỮ với hợp đồng gốc.",\n'
        '    "auto_fixable": true/false,\n'
        '    "risk_type": "modification hoặc recommendation",\n'
        '    "risk_source_detail": "Template hoặc AuditPolicy: [rule] hoặc Comment: [bên]"\n'
        '  }\n'
        ']\n\n'

        'QUY TẮC BẮT BUỘC:\n'
        '- BÁO CÁO MỌI SAI LỆCH TEMPLATE, kể cả thay đổi nhỏ.\n'
        '- BÁO CÁO VI PHẠM AUDIT_POLICY, trích dẫn tên rule cụ thể.\n'
        '- KHÔNG TỰ SÁNG TẠO: Giống Template và tuân thủ AuditPolicy thì bỏ qua.\n'
        '- TÁCH FINDING RIÊNG: Cùng loại thay đổi lặp nhiều chỗ (VD: số ngày ở 4 Instalment) '
        'PHẢI tạo TỪNG finding item riêng biệt. KHÔNG gộp.\n'
        '- ORIGINAL TEXT NGẮN GỌN: 1-2 câu chứa lỗi, KHÔNG copy cả đoạn/mục.\n'
        '- BÁM SÁT ORIGINAL TEXT: PHẢI CÓ THỰC trong hợp đồng gốc.\n'
        '- STRICT LANGUAGE MATCHING: suggested_text cùng ngôn ngữ với hợp đồng.\n'
        '- risk_summary và recommendations LUÔN bằng Tiếng Việt.\n'
        '- CHỈ TRẢ VỀ JSON hợp lệ. Nếu không có finding thì trả [].\n'
    )

    if comments_context:
        prompt += f"\n[COMMENTS TỪ CÁC BÊN]:\n{comments_context}\n"

    if severity_context:
        prompt += f"\n[BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG]:\n{severity_context}\n"

    prompt += f"\n[QUY ĐỊNH/AUDIT_POLICY/TEMPLATE THAM CHIẾU]:\n{context_text}\n"
    prompt += f"\n[NỘI DUNG HỢP ĐỒNG CẦN RÀ SOÁT]:\n{contract_text}\n"
    return prompt


def get_full_context_review_prompt(
    contract_text: str,
    analysis_results_json: str,
) -> str:
    return (
        'Bạn là một Trợ lý Kiểm toán Pháp lý (Legal Audit Assistant).\n'
        'Rà soát lại kết quả phân tích hợp đồng do AI khác tạo ra.\n\n'
        'Với MỖI finding item, thực hiện 3 việc:\n'
        '1. KIỂM TRA TỒN TẠI: original_text có THỰC SỰ TỒN TẠI trong hợp đồng không?\n'
        '2. KIỂM TRA NGUỒN: risk_source_detail có trích dẫn nguồn cụ thể (Template/AuditPolicy) không? '
        'NẾU không có nguồn rõ ràng thì LOẠI BỎ.\n'
        '3. KIỂM TRA CHẤT LƯỢNG: suggested_text có hợp lý không?\n\n'
        'ĐỊNH DẠNG ĐẦU RA (JSON):\n'
        '- original_text KHÔNG TỒN TẠI thì loại bỏ hoặc sửa.\n'
        '- finding KHÔNG CÓ NGUỒN thì loại bỏ.\n'
        '- finding sai thì loại bỏ.\n'
        'Giữ nguyên cấu trúc JSON cho các finding hợp lệ, bao gồm risk_source_detail.\n'
        '[\n'
        '  {\n'
        '    "section_id": "...",\n'
        '    "risk_level": "...",\n'
        '    "risk_summary": "...",\n'
        '    "recommendations": ["..."],\n'
        '    "original_text": "... (đã xác minh)",\n'
        '    "suggested_text": "...",\n'
        '    "auto_fixable": true/false,\n'
        '    "risk_source_detail": "..."\n'
        '  }\n'
        ']\n\n'
        f'[KẾT QUẢ PHÂN TÍCH BAN ĐẦU]:\n{analysis_results_json}\n\n'
        f'[NỘI DUNG HỢP ĐỒNG]:\n{contract_text}\n'
    )


def get_contract_analysis_prompt(
    contract_type: str,
    section_title: str,
    section_id: str,
    section_text: str,
    rules_text: str,
    comments_text: str = "",
    severity_context: str = "",
) -> str:
    prompt = (
        f"ĐÓNG VAI TRÒ: Bạn là một Luật sư Doanh nghiệp Cấp cao (Senior Corporate Lawyer) chuyên về {contract_type}. "
        "Nhiệm vụ của bạn là rà soát tỉ mỉ điều khoản dưới đây để bảo vệ quyền lợi tối đa cho công ty (Client), đồng thời đảm bảo công bằng và tuân thủ pháp luật.\n\n"

        "MỤC TIÊU PHÂN TÍCH:\n"
        "0. XỬ LÝ COMMENT (NẾU CÓ): BẮT BUỘC ưu tiên đọc phần 'CONTEXT - COMMENTS TỪ CÁC BÊN' để hiểu người dùng muốn chỉnh sửa `original_text` như thế nào. "
        "Kéo theo đó, gọi 'Quy định nội bộ tham chiếu' ra so sánh xem cách sửa đó có hợp lý và tuân thủ hay không. "
        "Nếu YÊU CẦU HOÀN TOÀN KHÔNG HỢP LÝ / VI PHẠM: Phải ghi rõ vào `recommendations` lý do từ chối (dựa trên quy định) rồi mới đề xuất cách sửa đúng vào `suggested_text`. "
        "Nếu YÊU CẦU HỢP LÝ: Tạo `suggested_text` bám sát yêu cầu đó.\n"
        "1. SO SÁNH QUY ĐỊNH NỘI BỘ: Kiểm tra xem điều khoản có vi phạm hoặc thiếu sót so với 'Quy định nội bộ tham chiếu' bên dưới không. "
        "   ⚠️ CHÚ Ý: Nếu vi phạm quy định có 'Severity: High', phải cảnh báo mức độ rủi ro cao.\n"
        "2. ÁP DỤNG PHÂN LOẠI RỦI RO: Nếu có 'BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG', BẮT BUỘC dùng bảng này để xác định `risk_level` "
        "   cho loại điều khoản này. Bảng này ĐƯỢC ƯU TIÊN HƠN đánh giá chủ quan của bạn về mức độ nghiêm trọng.\n"
        "3. ĐÁNH GIÁ RỦI RO PHÁP LÝ: Phát hiện các điều khoản bất lợi (Harmful Clauses), gài bẫy (Hidden Fees, Automatic Renewals), hoặc miễn trừ trách nhiệm vô lý.\n"
        "4. KIỂM TRA TÍNH TUÂN THỦ & CHUẨN MỰC: Đảm bảo điều khoản rõ ràng, thi hành được (Enforceable) và phù hợp với tiêu chuẩn ngành.\n"
        "5. ĐỀ XUẤT ĐÀM PHÁN: Đưa ra chiến lược sửa đổi để giảm thiểu rủi ro nhưng vẫn giữ được mối quan hệ hợp tác.\n\n"

        "ĐỊNH DẠNG ĐẦU RA (JSON format):\n"
        "Trả về JSON (không dùng code block) với các trường:\n"
        "- `risk_level` (string): 'no_risk', 'low', 'medium', hoặc 'high'. "
        "  Dựa trên Severity của Rule vi phạm nếu có. Ưu tiên dùng BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG nếu có. "
        "  ⚠️ QUAN TRỌNG: Nếu điều khoản đã hợp lý và tuân thủ hoàn toàn quy định nội bộ, HÃY TRẢ VỀ 'no_risk'.\n"
        "- `risk_summary` (string): Phân tích ngắn gọn rủi ro (Tiếng Việt). Để TRỐNG '' nếu risk_level='no_risk'.\n"
        "- `recommendations` (list[string]): Các điểm cần đàm phán hoặc sửa đổi. Để RỖNG [] nếu risk_level='no_risk'.\n"
        "- `original_text` (string): Trích dẫn CHÍNH XÁC (copy-paste 100%) một đoạn hoặc câu từ hợp đồng gốc cần sửa đổi. "
        "  Để RỖNG '' nếu risk_level='no_risk'. "
        "  TUYỆT ĐỐI KHÔNG chọn Tiêu đề, Mục lục, hay các chữ số đứng riêng lẻ làm `original_text`.\n"
        "- `suggested_text` (string): Văn bản thay thế hoàn chỉnh, KHÔNG chứa hội thoại hay giải thích. "
        "  Để RỖNG '' nếu risk_level='no_risk'. "
        "  BẮT BUỘC viết nguyên văn câu đã được sửa (Ví dụ: KHÔNG viết 'Thêm 14 ngày', phải viết 'Within 14 days, the Employer...').\n"
        "- `auto_fixable` (boolean): true nếu sửa đổi là an toàn để thay thế tự động. false nếu risk_level='no_risk'.\n\n"

        "CHIẾN LƯỢC SỬA ĐỔI (Minimalism Strategy):\n"
        "1. NGUYÊN TẮC 'dao mổ' (SURGICAL PRECISION): Chỉ sửa những gì thực sự hư hỏng. Nếu câu gốc không gây rủi ro, HÃY GIỮ NGUYÊN HOÀN TOÀN.\n"
        "2. ƯU TIÊN GIỮ CẤU TRÚC: Giữ nguyên cấu trúc câu (Chủ ngữ - Vị ngữ) của bản gốc để Diff ít bị xáo trộn nhất.\n"
        "3. KHÔNG CHỌN MỤC LỤC: Bỏ qua hoàn toàn các dòng Mục lục hoặc Tiêu đề tóm tắt. Nếu lỗi xảy ra ở điều khoản chưa đủ văn cảnh, chỉ ghi vào `recommendations`, KHÔNG tự ý vơ vét các đoạn text không liên quan.\n"
        "4. KHI SỬA ĐỔI: Ưu tiên bổ sung điều kiện (provisos) hoặc carve-outs vào cuối câu thay vì viết lại cả đoạn.\n\n"

        "QUY TẮC BẮT BUỘC (Hard Constraints):\n"
        "- BÁM SÁT ORIGINAL TEXT: `suggested_text` phải dựa sát vào `original_text` để cơ chế auto-replace hoạt động chính xác.\n"
        "- NO CONVERSATIONAL TEXT: `suggested_text` được phần mềm dùng để AUTO-REPLACE trực tiếp vào hợp đồng. "
        "  TUYỆT ĐỐI KHÔNG viết 'Nên đổi thành...', 'Change this to...'. Nếu muốn đưa ra lời khuyên, ghi vào `recommendations`. "
        "  Nếu đề xuất là xóa bỏ điều khoản, trả về '' hoặc '[Deleted]'.\n"
        "- STRICT LANGUAGE MATCHING: `suggested_text` PHẢI CÙNG NGÔN NGỮ với `original_text` (hợp đồng Tiếng Anh → `suggested_text` TIẾNG ANH). "
        "  Viết Tiếng Việt vào `suggested_text` của hợp đồng Tiếng Anh là LỖI NGHIÊM TRỌNG.\n"
        "- CHUẨN HOÁ NGÔN NGỮ BÁO CÁO: `risk_summary` LUÔN bằng Tiếng Việt dù ngôn ngữ hợp đồng là gì.\n"
        "- KHÔNG thay đổi tên riêng (Công ty Cổ phần AAA, Ông Nguyễn Văn A...) thành từ chung.\n"
        "- KHÔNG áp dụng máy móc các quy định không liên quan (Quy định Vận tải KHÔNG áp dụng cho NDA).\n"
        "- Chỉ trả về JSON hợp lệ, không code block.\n\n"

        f"--- DỮ LIỆU ĐẦU VÀO ---\n"
        f"Điều khoản ({section_id} - {section_title}):\n{section_text}\n"
    )

    if comments_text:
        prompt += f"\n[CONTEXT - COMMENTS TỪ CÁC BÊN]:\n{comments_text}\n"

    if severity_context:
        prompt += (
            f"\n[BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG CỦA CÁC ĐIỀU KHOẢN]:\n"
            f"(Đây là bảng phân loại được soạn thảo bởi pháp lý nội bộ. BẮT BUỘC dùng bảng này để "
            f"xác định `risk_level` cho loại điều khoản tương ứng. "
            f"Nếu điều khoản này thuộc nhóm 'High' theo bảng → `risk_level` PHẢI là 'high'. "
            f"Nếu thuộc nhóm 'Medium' → `risk_level` tối thiểu là 'medium'.)\n"
            f"{severity_context}\n"
        )

    prompt += f"\nQuy định nội bộ tham chiếu:\n{rules_text}"
    return prompt


def get_entity_conflict_prompt(text_head: str) -> str:
    prompt = (
        "Bạn là chuyên gia kiểm lỗi hợp đồng. Nhiệm vụ: Kiểm tra phần ĐẠI DIỆN CÁC BÊN (Party A, Party B).\n"
        "Dữ liệu đầu vào là 2000 ký tự đầu của hợp đồng.\n\n"
        "Kiểm tra các lỗi sau:\n"
        "1. Tên BÊN A và BÊN B có giống hệt nhau không? (Lỗi Copy/Paste nghiêm trọng)\n"
        "2. Tên BÊN A hoặc BÊN B có bị để trống hoặc là placeholder (ví dụ: '[TÊN CÔNG TY]', 'XXX', '...')?\n"
        "3. Tên viết tắt của một bên có mâu thuẫn với tên đầy đủ không? (Ví dụ: tên đầy đủ 'ABC Corp' nhưng viết tắt gọi là 'XYZ').\n\n"
        "Kết quả trả về JSON:\n"
        "- Nếu phát hiện lỗi bất kỳ ở trên:\n"
        "  - `has_error`: true\n"
        "  - `summary`: Mô tả lỗi cụ thể (ví dụ: 'LỖI: Bên A và Bên B là cùng một thực thể...').\n"
        "  - `recommendation`: Hướng dẫn sửa lỗi cụ thể.\n"
        "- Nếu không có lỗi nào: `has_error`: false.\n\n"
        "Chỉ trả về JSON."
    )
    return f"{prompt}\n\n--- TEXT ---\n{text_head}"


def get_missing_clauses_prompt(contract_type: str, toc_text: str, language: str = "vi") -> str:
    lang_instruction = "tiếng Anh (English)" if language.lower() == "en" else "tiếng Việt"

    prompt = (
        f"Bạn là chuyên gia pháp lý. Hãy phân tích cấu trúc của bản '{contract_type}' sau đây:\n"
        f"--- MỤC LỤC HỢP ĐỒNG ---\n{toc_text}\n\n"
        f"--- NHIỆM VỤ ---\n"
        f"1. So sánh với chuẩn mực của một bản {contract_type} đầy đủ và chặt chẽ.\n"
        f"2. Phát hiện CÁC ĐIỀU KHOẢN QUAN TRỌNG BỊ THIẾU (Missing Clauses). "
        f"   CHỈ liệt kê những điều khoản THỰC SỰ quan trọng và thiếu, tối đa 5 mục. Đừng cố tìm lỗi nếu không có.\n"
        f"3. Trả về kết quả JSON (List of Objects), mỗi object gồm:\n"
        f"   - `action`: \"INSERT\" (Luôn là INSERT cho mục thiếu).\n"
        f"   - `missing_item`: Tên điều khoản bị thiếu.\n"
        f"   - `reason`: Tại sao cần có điều khoản này (ngắn gọn, 1-2 câu).\n"
        f"   - `anchor_id`: ID của điều khoản (trong danh sách trên) mà điều khoản này nên nằm ngay sau nó. Ví dụ 'sec_5'.\n"
        f"   - `standard_content`: Nội dung mẫu chuẩn cho điều khoản này ({lang_instruction}). "
        f"     BẮT BUỘC: Phần này phải được viết bằng {lang_instruction} để đồng nhất với ngôn ngữ hợp đồng.\n"
        f"Nếu hợp đồng đầy đủ và không thiếu điều khoản quan trọng nào, trả về mảng rỗng [].\n"
        f"Chỉ trả về JSON, không code block."
    )
    return prompt


def get_template_analysis_prompt(
    contract_type: str, section_title: str, upload_excerpt: str, template_excerpt: str,
    severity_context: str = "",
) -> str:
    prompt = (
        f"Bạn là chuyên gia pháp lý chuyên rà soát {contract_type}.\n"
        f"Nhiệm vụ: So sánh mục HỢP ĐỒNG TẢI LÊN với MẪU CHUẨN và phát hiện sai lệch.\n\n"
        # AGREEMENT first — makes it the primary focus for extraction
        f"--- HỢP ĐỒNG TẢI LÊN ({section_title}) ---\n{upload_excerpt}\n\n"
        f"--- MẪU CHUẨN ({section_title}) ---\n{template_excerpt}\n\n"
        f"Trả về JSON duy nhất với các trường:\n"
        f"- `risk_summary`   : Tóm tắt ngắn về sai lệch (Tiếng Việt, '' nếu không có).\n"
        f"- `risk_level`     : 'low' | 'medium' | 'high'.\n"
        f"- `recommendations`: Danh sách gợi ý sửa đổi ([] nếu không có).\n"
        f"- `original_text`  : TRÍCH DẪN CHÍNH XÁC (copy-paste 100%) đoạn CÓ VẤN ĐỀ từ 'HỢP ĐỒNG TẢI LÊN'. "
        f"  TUYỆT ĐỐI KHÔNG lấy nội dung từ 'MẪU CHUẨN'. Để '' nếu không xác định được đoạn cụ thể.\n"
        f"- `suggested_text` : Văn bản thay thế đề xuất cho `original_text`, bám sát nội dung MẪU CHUẨN. "
        f"  PHẢI CÙNG NGÔN NGỮ với HỢP ĐỒNG TẢI LÊN. Không chứa hội thoại, giải thích, hay lời khuyên. Để '' nếu không cần.\n"
        f"- `auto_fixable`   : true nếu có thể tự động áp dụng suggested_text.\n\n"
        f"Quy tắc phân tích:\n"
        f"1. Nếu nội dung khớp hoàn toàn hoặc tương đương → risk_level='low', risk_summary='', original_text='', suggested_text=''.\n"
        f"2. Nếu thiếu một phần nhỏ hoặc thay đổi thuật ngữ không ảnh hưởng nghĩa → risk_level='medium'.\n"
        f"3. Nếu thiếu điều khoản quan trọng hoặc thay đổi nghĩa pháp lý → risk_level='high'.\n"
        f"4. `original_text` TUYỆT ĐỐI KHÔNG được lấy từ 'MẪU CHUẨN' — chỉ được lấy từ 'HỢP ĐỒNG TẢI LÊN'.\n\n"
        f"Quy tắc xử lý PLACEHOLDER (quan trọng):\n"
        f"- MẪU CHUẨN có thể chứa các placeholder dạng [name], [location], [date], v.v.\n"
        f"- Nếu HỢP ĐỒNG TẢI LÊN đã THAY PLACEHOLDER bằng một GIÁ TRỊ CỤ THỂ RÕ RÀNG "
        f"  (ví dụ: [name] → 'Smart Agreement', [date] → '01/01/2025') → ĐÂY LÀ HỢP LỆ, KHÔNG CẦN FLAG.\n"
        f"- Nếu placeholder bị thay bằng một từ MƠ HỒ / KHÔNG CỤ THỂ "
        f"  (ví dụ: [location] → 'the Site', [name] → 'the Company') → ĐÂY LÀ VẤN ĐỀ. "
        f"  Hãy: (a) đặt auto_fixable=false, (b) ghi rõ vào recommendations rằng người dùng "
        f"  cần điền giá trị cụ thể vào chỗ đó, (c) đặt original_text là đoạn chứa phần mơ hồ đó.\n"
        f"- Nếu HỢP ĐỒNG TẢI LÊN vẫn còn GIỮ NGUYÊN placeholder dạng [name], [location] chưa thay → flag high finding.\n"
        f"Chỉ trả về JSON hợp lệ, không code block, không giải thích."
    )

    if severity_context:
        prompt += (
            f"\n\n[BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG CỦA CÁC ĐIỀU KHOẢN]:\n"
            f"(BẮT BUỘC dùng bảng này để xác định `risk_level`. "
            f"Nếu điều khoản thuộc nhóm 'High' → risk_level PHẢI là 'high'. "
            f"Nếu thuộc nhóm 'Medium' → risk_level tối thiểu là 'medium'.)\n"
            f"{severity_context}\n"
        )

    return prompt


def get_rule_compliance_prompt(
    contract_type: str,
    rule_text: str,
    rule_severity: str,
    section_title: str,
    section_text: str,
    severity_context: str = "",
) -> str:
    """
    Prompt for evaluating whether a agreement section complies with a specific audit_policy rule.
    Direction: Rule → Agreement Section (rule-centric matching).
    """
    prompt = (
        f"ĐÓNG VAI TRÒ: Bạn là một Luật sư Doanh nghiệp Cấp cao chuyên về {contract_type}.\n"
        "Nhiệm vụ: Đánh giá xem điều khoản hợp đồng dưới đây có TUÂN THỦ quy định nội bộ được cung cấp hay không.\n\n"

        "MỤC TIÊU PHÂN TÍCH:\n"
        "1. SO SÁNH với QUY ĐỊNH NỘI BỘ: Kiểm tra xem điều khoản hợp đồng có vi phạm hoặc thiếu sót so với quy định.\n"
        "2. ĐÁNH GIÁ RỦI RO: Nếu vi phạm, nêu rõ mức độ nghiêm trọng dựa trên severity của quy định.\n"
        "3. ĐỀ XUẤT SỬA ĐỔI: Đưa ra suggested_text cụ thể để sửa vi phạm (nếu có).\n\n"

        "ĐỊNH DẠNG ĐẦU RA (JSON format):\n"
        "Trả về JSON (không dùng code block) với các trường:\n"
        "- `risk_level` (string): 'no_risk', 'low', 'medium', hoặc 'high'.\n"
        f"  ⚠️ Severity của quy định là '{rule_severity}'. Nếu vi phạm quy định này, risk_level PHẢI >= severity đó.\n"
        "  Nếu điều khoản đã tuân thủ hoàn toàn, trả về 'no_risk'.\n"
        "- `risk_summary` (string): Phân tích ngắn gọn rủi ro (Tiếng Việt). Để TRỐNG '' nếu risk_level='no_risk'.\n"
        "- `recommendations` (list[string]): Các điểm cần sửa đổi. Để RỖNG [] nếu risk_level='no_risk'.\n"
        "- `original_text` (string): Trích dẫn CHÍNH XÁC (copy-paste 100%) đoạn CẦN SỬA từ ĐIỀU KHOẢN HỢP ĐỒNG. "
        "  Để RỖNG '' nếu risk_level='no_risk'. "
        "  TUYỆT ĐỐI KHÔNG chọn Tiêu đề hoặc chữ số đứng riêng lẻ.\n"
        "- `suggested_text` (string): Văn bản thay thế hoàn chỉnh cho `original_text`. "
        "  PHẢI CÙNG NGÔN NGỮ với `original_text`. "
        "  Để RỖNG '' nếu risk_level='no_risk'.\n"
        "- `auto_fixable` (boolean): true nếu sửa đổi an toàn để thay thế tự động.\n"
        "- `risk_type` (string): 'modification' (sửa đổi) hoặc 'recommendation' (khuyến nghị).\n\n"

        "QUY TẮC BẮT BUỘC:\n"
        "- BÁM SÁT ORIGINAL TEXT: `suggested_text` phải dựa sát vào `original_text`.\n"
        "- NO CONVERSATIONAL TEXT: `suggested_text` dùng để AUTO-REPLACE. TUYỆT ĐỐI KHÔNG viết 'Nên đổi thành...'.\n"
        "- STRICT LANGUAGE MATCHING: `suggested_text` PHẢI CÙNG NGÔN NGỮ với `original_text`.\n"
        "- CHUẨN HOÁ NGÔN NGỮ BÁO CÁO: `risk_summary` LUÔN bằng Tiếng Việt.\n"
        "- KHÔNG áp dụng máy móc quy định không liên quan.\n"
        "- Chỉ trả về JSON hợp lệ.\n\n"

        f"--- QUY ĐỊNH NỘI BỘ (Severity: {rule_severity}) ---\n{rule_text}\n\n"
        f"--- ĐIỀU KHOẢN HỢP ĐỒNG ({section_title}) ---\n{section_text}\n"
    )

    if severity_context:
        prompt += (
            f"\n[BẢNG PHÂN LOẠI MỨC ĐỘ NGHIÊM TRỌNG]:\n"
            f"{severity_context}\n"
        )

    return prompt


