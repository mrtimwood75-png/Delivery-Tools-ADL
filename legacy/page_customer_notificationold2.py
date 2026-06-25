import base64
import io
import json
from pathlib import Path

import pandas as pd
import requests
import streamlit as st
import stripe


MODULE_VERSION = "Customer Notification v1.2.0"
TEMPLATE_FILE = Path("notification-templates.json")


# -----------------------------
# Stripe payment redirect screens
# -----------------------------
def show_payment_redirect():
    payment = st.query_params.get("payment")

    if not payment:
        return False

    logo_candidates = [
        Path("files/BCLOGO.jpg"),
        Path("files/BCLOGO.png"),
        Path("Files/BCLOGO.jpg"),
        Path("Files/BCLOGO.png"),
    ]
    logo_path = next((c for c in logo_candidates if c.exists()), None)

    logo_html = ""
    if logo_path:
        try:
            mime = "image/png" if logo_path.suffix.lower() == ".png" else "image/jpeg"
            logo_b64 = base64.b64encode(logo_path.read_bytes()).decode("utf-8")
            logo_html = f'<img class="redirect-logo" src="data:{mime};base64,{logo_b64}" alt="BoConcept logo">'
        except Exception:
            logo_html = '<div class="redirect-logo-text">BoConcept</div>'
    else:
        logo_html = '<div class="redirect-logo-text">BoConcept</div>'

    if payment == "success":
        icon = "✓"
        title = "Payment received"
        message = "Thank you. Your payment has been processed successfully."
    elif payment in ["cancel", "cancelled", "canceled"]:
        icon = "×"
        title = "Payment cancelled"
        message = "No payment has been processed."
    else:
        icon = ""
        title = "Payment status unavailable"
        message = "We could not determine the payment status from this link."

    st.markdown(
        f"""
        <style>
        #MainMenu {{ visibility: hidden; }}
        footer {{ visibility: hidden; }}
        header {{ visibility: hidden; }}

        .stApp {{
            background: #ffffff;
            color: #111111;
        }}

        .block-container {{
            max-width: 720px;
            padding-top: 72px;
            padding-bottom: 72px;
        }}

        .redirect-page {{
            width: 100%;
            max-width: 560px;
            margin: 0 auto;
            text-align: center;
        }}

        .redirect-logo {{
            display: block;
            width: 180px;
            height: auto;
            margin: 0 auto 34px auto;
        }}

        .redirect-logo-text {{
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 34px;
        }}

        .redirect-icon {{
            width: 58px;
            height: 58px;
            border: 2px solid #111111;
            border-radius: 50%;
            margin: 0 auto 26px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 34px;
            line-height: 1;
            color: #111111;
        }}

        .redirect-title {{
            font-size: 32px;
            line-height: 1.15;
            font-weight: 700;
            margin: 0 0 16px 0;
            color: #111111;
        }}

        .redirect-message {{
            font-size: 17px;
            line-height: 1.55;
            margin: 0 auto;
            max-width: 460px;
            color: #222222;
        }}

        .redirect-footer {{
            margin-top: 44px;
            padding-top: 22px;
            border-top: 1px solid #dddddd;
            font-size: 14px;
            color: #555555;
        }}
        </style>

        <div class="redirect-page">
            {logo_html}
            <div class="redirect-icon">{icon}</div>
            <div class="redirect-title">{title}</div>
            <div class="redirect-message">{message}</div>
            <div class="redirect-footer">BoConcept</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    return True

# -----------------------------
# Helpers
# -----------------------------
def parse_amount(value):
    value = str(value).strip()
    if not value:
        return 0.0
    value = value.replace(".", "").replace(",", ".")
    try:
        return float(value)
    except Exception:
        return 0.0


def format_amount_au(value):
    return f"${float(value):,.2f}"


def normalize_mobile_au(mobile):
    mobile = str(mobile).strip()

    allowed = []
    for ch in mobile:
        if ch.isdigit() or ch == "+":
            allowed.append(ch)
    mobile = "".join(allowed)

    if not mobile:
        return ""

    if mobile.startswith("+61"):
        return mobile
    if mobile.startswith("61"):
        return "+" + mobile
    if mobile.startswith("04") and len(mobile) >= 10:
        return "+61" + mobile[1:]

    return mobile


def normalize_sender_number(sender):
    sender = str(sender).strip()
    if not sender:
        return ""

    allowed = []
    for ch in sender:
        if ch.isdigit() or ch == "+":
            allowed.append(ch)
    sender = "".join(allowed)

    if sender.startswith("+61"):
        return sender
    if sender.startswith("61"):
        return "+" + sender
    if sender.startswith("04") and len(sender) >= 10:
        return "+61" + sender[1:]

    return sender


def get_secret(name, default=""):
    try:
        return st.secrets[name]
    except Exception:
        return default


def reset_diag():
    st.session_state.notification_diag = []


def add_diag(label, value):
    if "notification_diag" not in st.session_state:
        st.session_state.notification_diag = []
    st.session_state.notification_diag.append((label, value))


def empty_notification_df():
    df = pd.DataFrame(
        columns=[
            "Send?",
            "Customer Name",
            "Mobile",
            "Order number",
            "Balance payable",
            "Stripe Session ID",
            "Stripe Checkout URL",
            "Stripe Link Amount",
            "SMS Status",
            "Payment Status",
            "Date Sent",
        ]
    )
    return ensure_action_columns(df)


# -----------------------------
# Template storage
# -----------------------------
def default_templates():
    return {
        "Standard payment request": {
            "text": (
                "Hi {customer_name}, payment for order {order_number} is now due. "
                "Amount payable: {balance_payable}. Please pay securely here: {stripe_checkout_url}"
            ),
            "audience": "Balance only",
        },
        "Friendly reminder": {
            "text": (
                "Hi {customer_name}, just a reminder that payment for order {order_number} "
                "of {balance_payable} is outstanding. Payment link: {stripe_checkout_url}"
            ),
            "audience": "Balance only",
        },
        "Short version": {
            "text": "Hi {customer_name}, please pay {balance_payable} for order {order_number}: {stripe_checkout_url}",
            "audience": "Balance only",
        },
        "Delivery notice": {
            "text": "Hi {customer_name}, your order {order_number} is ready for delivery scheduling.",
            "audience": "Zero balance only",
        },
        "General notice": {
            "text": "Hi {customer_name}, this is an update regarding order {order_number}.",
            "audience": "Both",
        },
    }


def save_templates_to_file():
    TEMPLATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TEMPLATE_FILE, "w", encoding="utf-8") as f:
        json.dump(st.session_state.notification_templates, f, indent=2, ensure_ascii=False)


def load_templates_from_file():
    if TEMPLATE_FILE.exists():
        try:
            with open(TEMPLATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and data:
                return data
        except Exception:
            pass

    data = default_templates()
    TEMPLATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TEMPLATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return data


def apply_selected_template_to_editor():
    template_name = st.session_state.notification_template_name
    template_cfg = st.session_state.notification_templates.get(template_name, {})
    st.session_state.cn_template_text = template_cfg.get("text", "")
    st.session_state.cn_template_audience = template_cfg.get("audience", "Both")


def save_current_template():
    name = st.session_state.notification_template_name.strip()
    if not name:
        raise ValueError("No template selected.")

    st.session_state.notification_templates[name] = {
        "text": st.session_state.get("cn_template_text", ""),
        "audience": st.session_state.get("cn_template_audience", "Both"),
    }
    save_templates_to_file()


# -----------------------------
# Parsing / export
# -----------------------------
def parse_notification_report(file_bytes):
    text = file_bytes.decode("utf-8", errors="ignore")
    lines = [line.rstrip("\r") for line in text.splitlines() if line.strip()]

    if not lines:
        return empty_notification_df()

    rows = [line.split("\t") for line in lines]
    header = rows[0]
    data_rows = rows[1:]

    records = []
    for row in data_rows:
        if not row:
            continue

        first_cell = row[0].strip() if len(row) > 0 else ""
        if first_cell.lower().startswith("super grand total"):
            continue

        row_dict = {}
        for i, col in enumerate(header):
            row_dict[col.strip()] = row[i].strip() if i < len(row) else ""

        balance = parse_amount(row_dict.get("Balance due", ""))

        records.append(
            {
                "Send?": balance > 0,
                "Customer Name": row_dict.get("Name", ""),
                "Mobile": normalize_mobile_au(row_dict.get("Customer account", "")),
                "Order number": row_dict.get("Sales order", "").upper(),
                "Balance payable": balance,
                "Stripe Session ID": "",
                "Stripe Checkout URL": "",
                "Stripe Link Amount": balance if balance > 0 else 0.0,
                "SMS Status": "",
                "Payment Status": "Unpaid" if balance > 0 else "No balance",
                "Date Sent": "",
            }
        )

    return pd.DataFrame(records)


def ensure_action_columns(df):
    required_columns = [
        "Send?",
        "Customer Name",
        "Mobile",
        "Order number",
        "Balance payable",
        "Stripe Session ID",
        "Stripe Checkout URL",
        "Stripe Link Amount",
        "SMS Status",
        "Payment Status",
        "Date Sent",
    ]

    for col in required_columns:
        if col not in df.columns:
            if col == "Send?":
                df[col] = True
            elif col in ["Balance payable", "Stripe Link Amount"]:
                df[col] = 0.0
            else:
                df[col] = ""

    return df[required_columns]


def refresh_payment_status(row):
    try:
        amt = float(row["Balance payable"])
    except Exception:
        amt = 0.0

    if amt <= 0:
        return "No balance"

    existing = str(row.get("Payment Status", "")).strip()
    if existing in ["Pending payment", "Paid"]:
        return existing
    return "Unpaid"


def template_audience_matches(balance, audience):
    has_balance = float(balance or 0) > 0
    if audience == "Both":
        return True
    if audience == "Balance only":
        return has_balance
    if audience == "Zero balance only":
        return not has_balance
    return True


def filtered_df_by_view(df, view_filter):
    if view_filter == "Hide Zero Balances":
        return df[df["Balance payable"].fillna(0).astype(float) > 0].copy()
    if view_filter == "Hide Orders With Balance":
        return df[df["Balance payable"].fillna(0).astype(float) <= 0].copy()
    return df.copy()


def to_excel_bytes(df):
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Customer Notifications")
    output.seek(0)
    return output.getvalue()


# -----------------------------
# Stripe
# -----------------------------
def create_stripe_checkout_session(row):
    secret_key = get_secret("STRIPE_SECRET_KEY")
    success_url = get_secret("STRIPE_SUCCESS_URL")
    cancel_url = get_secret("STRIPE_CANCEL_URL")

    if not secret_key:
        raise ValueError("Missing STRIPE_SECRET_KEY in Streamlit secrets.")
    if not success_url or not cancel_url:
        raise ValueError("Missing STRIPE_SUCCESS_URL or STRIPE_CANCEL_URL in Streamlit secrets.")

    amount = float(row["Balance payable"])
    if amount <= 0:
        raise ValueError("Balance payable must be greater than 0.")

    stripe.api_key = secret_key

    session = stripe.checkout.Session.create(
        mode="payment",
        client_reference_id=str(row["Order number"]),
        line_items=[
            {
                "price_data": {
                    "currency": "aud",
                    "product_data": {
                        "name": f"Order {row['Order number']}",
                        "description": f"Balance payment for {row['Customer Name']}",
                    },
                    "unit_amount": int(round(amount * 100)),
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "customer_name": str(row["Customer Name"]),
            "mobile": str(row["Mobile"]),
            "order_number": str(row["Order number"]),
            "balance_payable": str(row["Balance payable"]),
        },
    )

    return session.id, session.url


# -----------------------------
# MessageMedia REST API (Basic Auth)
# -----------------------------
def messagemedia_config(debug=False):
    api_key = get_secret("MESSAGEMEDIA_API_KEY")
    api_secret = get_secret("MESSAGEMEDIA_API_SECRET")
    sender_id_raw = get_secret("MESSAGEMEDIA_SENDER_ID", "").strip()
    base_url = get_secret("MESSAGEMEDIA_BASE_URL", "https://api.messagemedia.com").strip().rstrip("/")

    if not api_key or not api_secret:
        raise ValueError("Missing MESSAGEMEDIA_API_KEY or MESSAGEMEDIA_API_SECRET in Streamlit secrets.")

    is_numeric_sender = any(ch.isdigit() for ch in sender_id_raw)
    sender_id = normalize_sender_number(sender_id_raw) if is_numeric_sender else sender_id_raw

    if debug:
        add_diag("MessageMedia Base URL", base_url)
        add_diag("MessageMedia Sender ID (raw)", sender_id_raw if sender_id_raw else "(blank - will use account default)")
        add_diag("MessageMedia Sender ID (final)", sender_id if sender_id else "(blank - will use account default)")
        add_diag("API Key present", "Yes")
        add_diag("API Secret present", "Yes")

    return {
        "api_key": api_key,
        "api_secret": api_secret,
        "sender_id": sender_id,
        "base_url": base_url,
    }


def messagemedia_send_message(to_mobile, message, debug=False):
    cfg = messagemedia_config(debug=debug)

    payload = {
        "messages": [
            {
                "content": message,
                "destination_number": normalize_mobile_au(to_mobile),
                "format": "SMS",
            }
        ]
    }

    sender_value = cfg["sender_id"].strip()
    if sender_value:
        payload["messages"][0]["source_number"] = sender_value
        if sender_value.startswith("+"):
            payload["messages"][0]["source_number_type"] = "INTERNATIONAL"

    url = f"{cfg['base_url']}/v1/messages"
    resp = requests.post(
        url,
        json=payload,
        auth=(cfg["api_key"], cfg["api_secret"]),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        timeout=30,
    )

    if debug:
        add_diag("MessageMedia URL", url)
        add_diag("HTTP status", resp.status_code)
        add_diag("Response body", resp.text)
        add_diag("Payload", payload)

    resp.raise_for_status()

    try:
        body = resp.json()
    except Exception:
        raise ValueError(f"Unexpected MessageMedia response: {resp.text}")

    messages = body.get("messages") or []
    if not messages:
        raise ValueError(f"Unexpected MessageMedia response: {body}")

    message_id = messages[0].get("message_id") or messages[0].get("messageId")
    if not message_id:
        raise ValueError(f"MessageMedia response missing message_id: {body}")

    return str(message_id)


# -----------------------------
# Message formatting
# -----------------------------
def build_sms_message(row, template_text):
    return template_text.format(
        customer_name=str(row.get("Customer Name", "")).strip(),
        order_number=str(row.get("Order number", "")).strip(),
        balance_payable=format_amount_au(row.get("Balance payable", 0)),
        stripe_checkout_url=str(row.get("Stripe Checkout URL", "")).strip(),
        mobile=str(row.get("Mobile", "")).strip(),
    )


# -----------------------------
# Data editor sync
# -----------------------------
def sync_notification_editor():
    if st.session_state.notification_df is None:
        return

    edited_df = st.session_state.notification_df.copy()

    editor_state = st.session_state.get("customer_notification_editor", {})
    if not isinstance(editor_state, dict):
        return

    edited_rows = editor_state.get("edited_rows", {})
    added_rows = editor_state.get("added_rows", [])
    deleted_rows = editor_state.get("deleted_rows", [])

    for row_idx, changes in edited_rows.items():
        try:
            row_idx = int(row_idx)
        except Exception:
            continue

        for col, value in changes.items():
            if row_idx in edited_df.index and col in edited_df.columns:
                edited_df.at[row_idx, col] = value

    if deleted_rows:
        edited_df = edited_df.drop(index=deleted_rows, errors="ignore")

    for new_row in added_rows:
        row_data = {col: new_row.get(col, "") for col in edited_df.columns}
        if "Send?" in row_data and row_data["Send?"] in ("", None):
            row_data["Send?"] = False
        if "Balance payable" in row_data and row_data["Balance payable"] in ("", None):
            row_data["Balance payable"] = 0.0
        if "Stripe Link Amount" in row_data and row_data["Stripe Link Amount"] in ("", None):
            row_data["Stripe Link Amount"] = 0.0
        edited_df = pd.concat([edited_df, pd.DataFrame([row_data])], ignore_index=True)

    edited_df = edited_df.reset_index(drop=True)
    edited_df = ensure_action_columns(edited_df)
    edited_df["Mobile"] = edited_df["Mobile"].apply(normalize_mobile_au)
    edited_df["Balance payable"] = pd.to_numeric(edited_df["Balance payable"], errors="coerce").fillna(0.0)
    edited_df["Stripe Link Amount"] = pd.to_numeric(edited_df["Stripe Link Amount"], errors="coerce").fillna(0.0)
    edited_df["Payment Status"] = edited_df.apply(refresh_payment_status, axis=1)

    st.session_state.notification_df = edited_df
    st.session_state.notification_excel_bytes = to_excel_bytes(edited_df)


# -----------------------------
# UI
# -----------------------------
def show_customer_notification_page():
    if show_payment_redirect():
        st.stop()

    if st.button("← Main Menu", key="back_from_customer_notification"):
        st.session_state.page = "home"
        st.rerun()

    st.markdown(
        """
        <style>
        #MainMenu {visibility:hidden;}
        footer {visibility:hidden;}
        header {visibility:hidden;}

        .stApp { background-color: #f6f6f4; }
        .block-container { max-width: 1220px; padding-top: 28px; padding-bottom: 40px; }

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

        .hero-version {
            color: #bdbdbd;
            font-size: 0.9rem;
            margin-top: 12px;
        }

        .note-box, .template-card, .preview-wrap, .diag-card, .upload-card {
            background: #ffffff;
            border: 1px solid #dadada;
            border-radius: 14px;
            padding: 18px 20px;
            color: #111111;
        }

        .note-box { margin-bottom: 18px; }
        .template-card, .preview-wrap, .diag-card, .upload-card { margin-top: 18px; }

        .section-title {
            font-size: 1rem;
            font-weight: 700;
            color: #111111;
            margin-bottom: 8px;
        }

        .small-muted {
            color: #666666;
            font-size: 0.92rem;
        }

        .toolbar-label {
            color: #666666;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-top: 8px;
            margin-bottom: 6px;
        }

        .status-banner {
            border-radius: 14px;
            padding: 14px 16px;
            margin-top: 16px;
            border: 1px solid;
        }

        .status-banner.success {
            background: #eefaf2;
            border-color: #b9e3c6;
        }

        .status-banner.warning {
            background: #fff8e8;
            border-color: #efd79b;
        }

        .status-banner.error {
            background: #fff1f1;
            border-color: #ebbbbb;
        }

        .status-title {
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 4px;
            color: #111111;
        }

        .status-meta {
            font-size: 0.94rem;
            color: #444444;
        }

        .stButton > button, .stDownloadButton > button {
            background: #111111 !important;
            color: white !important;
            border: 1px solid #111111 !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            min-height: 44px !important;
            width: 100% !important;
        }

        div[data-testid="stTextInput"] input,
        div[data-testid="stTextArea"] textarea,
        div[data-testid="stSelectbox"] div[data-baseweb="select"] {
            background: white !important;
        }

        div[data-testid="stFileUploader"] section {
            background: white !important;
            border-radius: 12px !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    if "notification_df" not in st.session_state:
        st.session_state.notification_df = empty_notification_df()
    if "notification_excel_bytes" not in st.session_state:
        st.session_state.notification_excel_bytes = to_excel_bytes(st.session_state.notification_df)
    if "notification_output_name" not in st.session_state:
        st.session_state.notification_output_name = "customer_notifications.xlsx"
    if "notification_diag" not in st.session_state:
        st.session_state.notification_diag = []
    if "notification_templates" not in st.session_state:
        st.session_state.notification_templates = load_templates_from_file()
    if "notification_template_name" not in st.session_state:
        st.session_state.notification_template_name = list(st.session_state.notification_templates.keys())[0]
    if "notification_new_template_name" not in st.session_state:
        st.session_state.notification_new_template_name = ""
    if "notification_last_result" not in st.session_state:
        st.session_state.notification_last_result = None
    if "notification_view_filter" not in st.session_state:
        st.session_state.notification_view_filter = "Show All"
    if "notification_send_scope" not in st.session_state:
        st.session_state.notification_send_scope = "All rows"
    if "cn_template_text" not in st.session_state:
        st.session_state.cn_template_text = ""
    if "cn_template_audience" not in st.session_state:
        st.session_state.cn_template_audience = "Both"

    if st.session_state.notification_template_name not in st.session_state.notification_templates:
        st.session_state.notification_template_name = list(st.session_state.notification_templates.keys())[0]

    if not st.session_state.cn_template_text and st.session_state.notification_template_name in st.session_state.notification_templates:
        apply_selected_template_to_editor()

    logo_candidates = [
        Path("files/BCLOGO.jpg"),
        Path("files/BCLOGO.png"),
        Path("Files/BCLOGO.jpg"),
        Path("Files/BCLOGO.png"),
    ]
    logo_path = next((c for c in logo_candidates if c.exists()), None)

    hero_left, hero_right = st.columns([1, 5], vertical_alignment="center")
    with hero_left:
        if logo_path:
            st.image(str(logo_path), width=130)

    with hero_right:
        st.markdown(
            f"""
            <div class="hero">
                <div class="hero-title">Customer Notification</div>
                <div class="hero-sub">Create Stripe payment links and send them by SMS from Tour Totals using MessageMedia.</div>
                <div class="hero-version">{MODULE_VERSION}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown(
        """
        <div class="note-box">
            <strong>Accepted input:</strong> Upload <strong>"Tour Totals"</strong> report from
            <strong>Axapta</strong> in <strong>ASCII (text)</strong> format, or type rows directly into the preview table.
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown('<div class="upload-card">', unsafe_allow_html=True)
    upload_left, upload_right = st.columns([1.7, 1], gap="large")

    with upload_left:
        st.markdown('<div class="section-title">Upload Tour Totals report</div>', unsafe_allow_html=True)
        uploaded_file = st.file_uploader(
            "Upload report",
            type=["txt"],
            accept_multiple_files=False,
            label_visibility="collapsed",
        )

    with upload_right:
        st.session_state.notification_output_name = st.text_input(
            "Output file name",
            value=st.session_state.notification_output_name,
            key="cn_output_name",
        )
        load_preview = st.button("Load Preview", key="cn_load_preview")

    st.markdown("</div>", unsafe_allow_html=True)

    if load_preview:
        if not uploaded_file:
            st.error("Upload a Tour Totals report.")
        else:
            try:
                df = parse_notification_report(uploaded_file.getvalue())
                df = ensure_action_columns(df)
                df["Mobile"] = df["Mobile"].apply(normalize_mobile_au)
                df["Balance payable"] = pd.to_numeric(df["Balance payable"], errors="coerce").fillna(0.0)
                df["Stripe Link Amount"] = pd.to_numeric(df["Stripe Link Amount"], errors="coerce").fillna(0.0)
                df["Payment Status"] = df.apply(refresh_payment_status, axis=1)

                st.session_state.notification_df = df
                st.session_state.notification_excel_bytes = to_excel_bytes(df)
                st.session_state.notification_last_result = None

                st.success(f"Rows detected: {len(df)}")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

    st.markdown('<div class="preview-wrap">', unsafe_allow_html=True)
    st.subheader("Preview")

    filter_left, filter_right = st.columns([1.2, 1.2])
    with filter_left:
        st.session_state.notification_view_filter = st.selectbox(
            "View filter",
            ["Show All", "Hide Zero Balances", "Hide Orders With Balance"],
            index=["Show All", "Hide Zero Balances", "Hide Orders With Balance"].index(
                st.session_state.notification_view_filter
            ),
            key="cn_view_filter",
        )
    with filter_right:
        visible_df = filtered_df_by_view(st.session_state.notification_df, st.session_state.notification_view_filter)
        st.caption(f"Visible rows: {len(visible_df)} | Total rows: {len(st.session_state.notification_df)}")

    st.data_editor(
        visible_df,
        width="stretch",
        hide_index=True,
        num_rows="dynamic",
        key="customer_notification_editor",
        on_change=sync_notification_editor,
        disabled=[
            "Stripe Session ID",
            "Stripe Checkout URL",
            "Stripe Link Amount",
            "SMS Status",
            "Payment Status",
            "Date Sent",
        ],
        column_config={
            "Send?": st.column_config.CheckboxColumn("Send?", help="Untick to exclude this row from SMS sending"),
            "Customer Name": st.column_config.TextColumn("Customer Name"),
            "Mobile": st.column_config.TextColumn("Mobile"),
            "Order number": st.column_config.TextColumn("Order number"),
            "Balance payable": st.column_config.NumberColumn(
                "Balance payable",
                format="$%.2f",
                min_value=0.0,
                step=0.01,
            ),
            "Stripe Session ID": st.column_config.TextColumn("Stripe Session ID"),
            "Stripe Checkout URL": st.column_config.TextColumn("Stripe Checkout URL"),
            "Stripe Link Amount": st.column_config.NumberColumn(
                "Stripe Link Amount",
                format="$%.2f",
            ),
            "SMS Status": st.column_config.TextColumn("SMS Status"),
            "Payment Status": st.column_config.TextColumn("Payment Status"),
            "Date Sent": st.column_config.TextColumn("Date Sent"),
        },
    )

    st.caption("You can edit customer data directly, add or delete rows, untick rows, and refresh Stripe links after balance changes.")
    update_links = st.button("Add / Update Stripe Links", key="cn_create_links")
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown('<div class="template-card">', unsafe_allow_html=True)
    st.markdown('<div class="section-title">Message templates</div>', unsafe_allow_html=True)

    template_names = list(st.session_state.notification_templates.keys())
    if st.session_state.notification_template_name not in template_names:
        st.session_state.notification_template_name = template_names[0]
    selected_index = template_names.index(st.session_state.notification_template_name)

    selected_template = st.selectbox(
        "Template",
        template_names,
        index=selected_index,
        key="cn_template_select",
    )

    if selected_template != st.session_state.notification_template_name:
        st.session_state.notification_template_name = selected_template
        apply_selected_template_to_editor()
        st.rerun()

    t1, t2 = st.columns([2, 1])
    with t1:
        st.text_area(
            "Message window",
            key="cn_template_text",
            height=140,
            help="The SMS will send from exactly what is written here.",
        )
        st.caption("Available fields: {customer_name}, {order_number}, {balance_payable}, {stripe_checkout_url}, {mobile}")
    with t2:
        st.selectbox(
            "Template audience",
            ["Balance only", "Zero balance only", "Both"],
            key="cn_template_audience",
            help="Controls which rows this message can send to.",
        )

    st.markdown('<div class="toolbar-label">Template management</div>', unsafe_allow_html=True)
    manage_left, manage_right = st.columns([2.4, 1.8], gap="large")

    with manage_left:
        st.session_state.notification_new_template_name = st.text_input(
            "New template name",
            value=st.session_state.notification_new_template_name,
            key="cn_new_template_name",
        )

    with manage_right:
        m1, m2, m3 = st.columns(3, gap="small")
        with m1:
            save_template = st.button("Save Template", key="cn_save_template")
        with m2:
            add_template = st.button("Add Template", key="cn_add_template")
        with m3:
            delete_template = st.button("Delete Template", key="cn_delete_template")

    if save_template:
        try:
            save_current_template()
            st.success(f'Template "{st.session_state.notification_template_name}" saved.')
        except Exception as e:
            st.error(str(e))

    if add_template:
        new_name = st.session_state.notification_new_template_name.strip()
        if not new_name:
            st.error("Enter a template name.")
        elif new_name in st.session_state.notification_templates:
            st.error("A template with that name already exists.")
        else:
            st.session_state.notification_templates[new_name] = {
                "text": st.session_state.get("cn_template_text", "").strip() or "Hi {customer_name}, this is an update regarding order {order_number}.",
                "audience": st.session_state.get("cn_template_audience", "Both"),
            }
            save_templates_to_file()
            st.session_state.notification_template_name = new_name
            st.session_state.cn_template_select = new_name
            apply_selected_template_to_editor()
            st.session_state.notification_new_template_name = ""
            st.success(f'Template "{new_name}" created.')
            st.rerun()

    if delete_template:
        current = st.session_state.notification_template_name
        if len(st.session_state.notification_templates) == 1:
            st.error("At least one template must remain.")
        else:
            del st.session_state.notification_templates[current]
            save_templates_to_file()
            remaining = list(st.session_state.notification_templates.keys())
            st.session_state.notification_template_name = remaining[0]
            st.session_state.cn_template_select = remaining[0]
            apply_selected_template_to_editor()
            st.success(f'Template "{current}" deleted.')
            st.rerun()

    st.markdown('<div class="toolbar-label">Actions</div>', unsafe_allow_html=True)
    act1, act2 = st.columns([1.2, 1], gap="large")
    with act1:
        st.session_state.notification_send_scope = st.selectbox(
            "Send scope",
            ["All rows", "Filtered view only"],
            index=["All rows", "Filtered view only"].index(st.session_state.notification_send_scope),
            key="cn_send_scope",
        )
    with act2:
        send_sms = st.button("Send SMS", key="cn_send_sms")

    result = st.session_state.get("notification_last_result")
    if result:
        status_type = result.get("type", "success")
        title = result.get("title", "Process complete")
        sent = result.get("sent", 0)
        failed = result.get("failed", 0)
        ts = result.get("timestamp", "")

        st.markdown(
            f"""
            <div class="status-banner {status_type}">
                <div class="status-title">{title}</div>
                <div class="status-meta">Sent: {sent} &nbsp;&nbsp; Failed: {failed} &nbsp;&nbsp; {ts}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.caption("The selected template only loads the message into the window. SMS sends from the current text in the message window.")
    st.markdown("</div>", unsafe_allow_html=True)

    with st.expander("Diagnostics"):
        d1, d2 = st.columns(2)
        with d1:
            test_sms_connection = st.button("Check API Settings", key="cn_test_sms_connection")
        with d2:
            show_secret_format = st.button("Show Secret Format", key="cn_test_sms_balance")

        if st.session_state.notification_diag:
            st.markdown('<div class="diag-card">', unsafe_allow_html=True)
            for label, value in st.session_state.notification_diag:
                st.write(f"**{label}:** {value}")
            st.markdown("</div>", unsafe_allow_html=True)

    if test_sms_connection:
        reset_diag()
        try:
            messagemedia_config(debug=True)
            st.success("MessageMedia settings look ready.")
        except Exception as e:
            st.error(f"MessageMedia settings check failed: {e}")

    if show_secret_format:
        reset_diag()
        try:
            example_secrets = """MESSAGEMEDIA_API_KEY = "your_api_key"
MESSAGEMEDIA_API_SECRET = "your_api_secret"
MESSAGEMEDIA_SENDER_ID = ""
MESSAGEMEDIA_BASE_URL = "https://api.messagemedia.com"

STRIPE_SECRET_KEY = "your_stripe_secret_key"
STRIPE_SUCCESS_URL = "https://your-app-url.streamlit.app/?payment=success"
STRIPE_CANCEL_URL = "https://your-app-url.streamlit.app/?payment=cancelled"
"""
            st.code(example_secrets, language="toml")
            st.success("Paste this into Streamlit secrets.")
        except Exception as e:
            st.error(f"Secret format display failed: {e}")

    if update_links:
        df = st.session_state.notification_df
        if df is None or df.empty:
            st.error("There are no rows to update.")
        else:
            try:
                created_or_updated = 0

                for idx in df.index:
                    amount = float(df.at[idx, "Balance payable"] or 0)
                    prior_amount = float(df.at[idx, "Stripe Link Amount"] or 0)
                    existing_url = str(df.at[idx, "Stripe Checkout URL"]).strip()

                    if amount <= 0:
                        df.at[idx, "Stripe Session ID"] = ""
                        df.at[idx, "Stripe Checkout URL"] = ""
                        df.at[idx, "Stripe Link Amount"] = 0.0
                        df.at[idx, "Payment Status"] = "No balance"
                        continue

                    needs_new_link = (not existing_url) or (round(amount, 2) != round(prior_amount, 2))

                    if not needs_new_link:
                        if str(df.at[idx, "Payment Status"]).strip() != "Paid":
                            df.at[idx, "Payment Status"] = "Pending payment"
                        continue

                    session_id, session_url = create_stripe_checkout_session(df.loc[idx])
                    df.at[idx, "Stripe Session ID"] = session_id
                    df.at[idx, "Stripe Checkout URL"] = session_url
                    df.at[idx, "Stripe Link Amount"] = amount
                    df.at[idx, "Payment Status"] = "Pending payment"
                    created_or_updated += 1

                st.session_state.notification_df = df
                st.session_state.notification_excel_bytes = to_excel_bytes(df)
                st.session_state.notification_last_result = {
                    "type": "success",
                    "title": "Stripe links updated",
                    "sent": created_or_updated,
                    "failed": 0,
                    "timestamp": pd.Timestamp.now().strftime("%d/%m/%Y %H:%M:%S"),
                }
                st.rerun()
            except Exception as e:
                st.session_state.notification_last_result = {
                    "type": "error",
                    "title": "Stripe link update failed",
                    "sent": 0,
                    "failed": 0,
                    "timestamp": pd.Timestamp.now().strftime("%d/%m/%Y %H:%M:%S"),
                }
                st.error(f"Stripe error: {e}")

    if send_sms:
        df = st.session_state.notification_df
        if df is None or df.empty:
            st.error("There are no rows to send.")
        else:
            try:
                sent = 0
                failed = 0
                reset_diag()

                template_text = st.session_state.get("cn_template_text", "").strip()
                template_audience = st.session_state.get("cn_template_audience", "Both")

                if not template_text:
                    st.error("Message window is blank.")
                    st.stop()

                if template_audience in ["Zero balance only", "Both"] and "{stripe_checkout_url}" in template_text:
                    st.error("This message can send to zero-balance rows but still contains {stripe_checkout_url}. Remove that placeholder or change the audience.")
                    st.stop()

                if st.session_state.notification_send_scope == "Filtered view only":
                    target_df = filtered_df_by_view(df, st.session_state.notification_view_filter)
                    target_indices = list(target_df.index)
                else:
                    target_indices = list(df.index)

                for idx in target_indices:
                    send_flag = bool(df.at[idx, "Send?"])
                    mobile = str(df.at[idx, "Mobile"]).strip()
                    link = str(df.at[idx, "Stripe Checkout URL"]).strip()
                    sms_status = str(df.at[idx, "SMS Status"]).strip()
                    amount = float(df.at[idx, "Balance payable"] or 0)

                    if not send_flag:
                        continue

                    if not template_audience_matches(amount, template_audience):
                        continue

                    if not mobile:
                        continue

                    if sms_status.startswith("Sent"):
                        continue

                    if amount > 0 and not link and "{stripe_checkout_url}" in template_text:
                        df.at[idx, "SMS Status"] = "Failed (Missing Stripe link)"
                        failed += 1
                        continue

                    msg = build_sms_message(df.loc[idx], template_text)

                    try:
                        message_id = messagemedia_send_message(mobile, msg, debug=(sent == 0 and failed == 0))
                        df.at[idx, "SMS Status"] = f"Sent ({message_id})"
                        df.at[idx, "Date Sent"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                        sent += 1
                    except Exception as inner_e:
                        df.at[idx, "SMS Status"] = f"Failed ({inner_e})"
                        failed += 1

                st.session_state.notification_df = df
                st.session_state.notification_excel_bytes = to_excel_bytes(df)
                st.session_state.notification_last_result = {
                    "type": "success" if failed == 0 and sent > 0 else "warning",
                    "title": "SMS sending complete" if failed == 0 else "SMS sending finished with issues",
                    "sent": sent,
                    "failed": failed,
                    "timestamp": pd.Timestamp.now().strftime("%d/%m/%Y %H:%M:%S"),
                }
                st.rerun()
            except Exception as e:
                st.session_state.notification_last_result = {
                    "type": "error",
                    "title": "SMS sending failed",
                    "sent": 0,
                    "failed": 0,
                    "timestamp": pd.Timestamp.now().strftime("%d/%m/%Y %H:%M:%S"),
                }
                st.error(f"SMS error: {e}")

    if st.session_state.notification_df is not None:
        st.session_state.notification_excel_bytes = to_excel_bytes(st.session_state.notification_df)

    if st.session_state.notification_excel_bytes:
        st.download_button(
            "Download Excel Spreadsheet",
            data=st.session_state.notification_excel_bytes,
            file_name=st.session_state.notification_output_name,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            key="cn_download_excel",
        )
