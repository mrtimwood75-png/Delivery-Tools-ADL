import streamlit as st
from pathlib import Path

from core_logic import (
    prepare_preview_rows,
    convert_uploaded_files,
    default_template_path,
    detect_report_format,
    parse_order_bytes,
)


def show_irise_delivery_sheet_creator_page():
    if st.button("← Main Menu", key="back_from_irise"):
        st.session_state.page = "home"
        st.rerun()

    # ---------- STYLE ----------
    st.markdown(
        """
        <style>
        #MainMenu {visibility:hidden;}
        footer {visibility:hidden;}
        header {visibility:hidden;}

        .stApp {
            background-color: #f6f6f4;
        }

        .block-container {
            max-width: 1220px;
            padding-top: 28px;
            padding-bottom: 40px;
        }

        .hero {
            background: #111111;
            border-radius: 18px;
            padding: 24px 28px;
            margin-bottom: 24px;
        }

        .hero-title {
            color: white;
            font-size: 2.2rem;
            font-weight: 700;
            line-height: 1.1;
            margin: 0;
        }

        .hero-sub {
            color: #d6d6d6;
            font-size: 1rem;
            margin-top: 8px;
        }

        .note-box {
            background: #ffffff;
            border: 1px solid #dadada;
            border-radius: 14px;
            padding: 16px 18px;
            margin-bottom: 18px;
            color: #111111;
        }

        .side-card {
            background: #ffffff;
            border: 1px solid #dadada;
            border-radius: 14px;
            padding: 18px 20px;
            color: #111111;
        }

        .section-title {
            font-size: 1rem;
            font-weight: 700;
            color: #111111;
            margin-bottom: 8px;
        }

        .preview-wrap {
            background: #ffffff;
            border: 1px solid #dadada;
            border-radius: 14px;
            padding: 18px 18px 8px 18px;
        }

        .stButton > button {
            background: #111111 !important;
            color: white !important;
            border: 1px solid #111111 !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            min-height: 44px !important;
        }

        .stDownloadButton > button {
            background: #111111 !important;
            color: white !important;
            border: 1px solid #111111 !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            min-height: 44px !important;
        }

        div[data-testid="stTextInput"] input {
            background: white !important;
        }

        div[data-testid="stFileUploader"] section {
            background: white !important;
            border-radius: 12px !important;
        }

        .small-muted {
            color: #666666;
            font-size: 0.92rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    # ---------- SESSION STATE ----------
    if "rows" not in st.session_state:
        st.session_state.rows = []
    if "workbook_bytes" not in st.session_state:
        st.session_state.workbook_bytes = None
    if "output_name" not in st.session_state:
        st.session_state.output_name = "converted_sales_orders.xlsx"

    # ---------- HEADER ----------
    logo_candidates = [
        Path("files/BCLOGO.jpg"),
        Path("files/BCLOGO.png"),
        Path("Files/BCLOGO.jpg"),
        Path("Files/BCLOGO.png"),
    ]

    logo_path = None
    for candidate in logo_candidates:
        if candidate.exists():
            logo_path = candidate
            break

    hero_left, hero_right = st.columns([1, 5], vertical_alignment="center")

    with hero_left:
        if logo_path:
            st.image(str(logo_path), width=130)

    with hero_right:
        st.markdown(
            """
            <div class="hero">
                <div class="hero-title">Delivery Sheet Creator</div>
                <div class="hero-sub">Convert ASCII reports into the delivery import workbook.</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ---------- NOTE ----------
    st.markdown(
        """
        <div class="note-box">
            <strong>Accepted input:</strong> Upload <strong>"Packinglist - Order"</strong> report
            from <strong>Axapta</strong> in <strong>ASCII (text)</strong> format.<br><br>
            The file will be converted into the delivery import workbook.
        </div>
        """,
        unsafe_allow_html=True,
    )

    with st.expander('Show example: where to find "Packinglist - Order" in Axapta'):
        image_candidates = [
            "IRiseSheet.jpg",
            "files/IRiseSheet.jpg",
        ]
        shown = False
        for img in image_candidates:
            if Path(img).exists():
                st.image(img, use_container_width=True)
                shown = True
                break
        if not shown:
            st.warning("Help image not found. Add IRiseSheet.jpg to the repo root or files folder.")

    # ---------- MAIN LAYOUT ----------
    left, right = st.columns([2.3, 1], gap="large")

    with left:
        st.markdown('<div class="section-title">Upload ASCII file(s)</div>', unsafe_allow_html=True)
        uploaded_files = st.file_uploader(
            "Upload ASCII files",
            type=["txt"],
            accept_multiple_files=True,
            label_visibility="collapsed",
        )

        st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

        b1, b2, b3 = st.columns([1, 1, 2])

        with b1:
            load_preview = st.button("Load Preview", use_container_width=True, key="irise_load_preview")

        with b2:
            create_file = st.button("Create Workbook", use_container_width=True, key="irise_create_file")

        with b3:
            st.session_state.output_name = st.text_input(
                "Output file name",
                value=st.session_state.output_name,
                key="irise_output_name",
            )

    with right:
        st.markdown(
            """
            <div class="side-card">
                <div class="section-title">Instructions</div>
                <div class="small-muted">
                    1. Export <strong>Packinglist - Order</strong> from Axapta in ASCII text format<br><br>
                    2. Upload the file(s)<br><br>
                    3. Click <strong>Load Preview</strong><br><br>
                    4. Review the parsed rows<br><br>
                    5. Click <strong>Create Workbook</strong><br><br>
                    6. Download the Excel file
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ---------- TEMPLATE ----------
    template_path = default_template_path()
    template_bytes = None
    if template_path:
        with open(template_path, "rb") as f:
            template_bytes = f.read()

    # ---------- LOAD PREVIEW ----------
    if load_preview:
        if not uploaded_files:
            st.error("Upload at least one ASCII file.")
        else:
            try:
                total_orders = 0
                total_items = 0
                formats = []

                for f in uploaded_files:
                    text = f.getvalue().decode(errors="ignore")
                    fmt = detect_report_format(text)
                    formats.append(fmt)

                    parsed = parse_order_bytes(f.getvalue())
                    total_orders += len(parsed)
                    total_items += sum(len(items) for _, items in parsed)

                st.success(f"Format detected: {', '.join(sorted(set(formats)))}")
                st.success(f"Orders detected: {total_orders} | Items detected: {total_items}")

                st.session_state.rows = prepare_preview_rows(uploaded_files)
                st.session_state.workbook_bytes = None

            except Exception as e:
                st.error(f"Error: {e}")

    # ---------- CREATE FILE ----------
    if create_file:
        if not template_bytes:
            st.error("Template not found in /files folder.")
        elif not st.session_state.rows:
            st.error("Load Preview first.")
        else:
            try:
                file_bytes = convert_uploaded_files(
                    uploaded_files,
                    template_bytes,
                    selected_rows=st.session_state.rows,
                )
                st.session_state.workbook_bytes = file_bytes
                st.success("Workbook created successfully.")
            except Exception as e:
                st.error(f"Export error: {e}")

    # ---------- DOWNLOAD ----------
    if st.session_state.workbook_bytes:
        st.download_button(
            "Download Excel Workbook",
            data=st.session_state.workbook_bytes,
            file_name=st.session_state.output_name,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="irise_download_workbook",
        )

    st.markdown("<div style='height:20px'></div>", unsafe_allow_html=True)

    # ---------- PREVIEW ----------
    st.markdown('<div class="preview-wrap">', unsafe_allow_html=True)
    st.subheader("Preview")

    if st.session_state.rows:
        preview_rows = st.session_state.rows[:200]

        for r in preview_rows:
            st.write(
                f"**{r['sales order number']}**  |  "
                f"{r['sku number']}  |  "
                f"{r['product description']}  |  "
                f"Qty {r['quantity']}"
            )

        if len(st.session_state.rows) > 200:
            st.caption(f"Showing first 200 of {len(st.session_state.rows)} rows")
    else:
        st.write("No data loaded")

    st.markdown("</div>", unsafe_allow_html=True)
