import streamlit as st
from pathlib import Path

from page_customer_notification import show_customer_notification_page


# -----------------------------
# Page config MUST be first Streamlit command
# -----------------------------
st.set_page_config(
    page_title="Delivery Tools - ADL",
    layout="wide",
)


# -----------------------------
# Global payment redirect page
# -----------------------------
def show_payment_redirect_global():
    payment = st.query_params.get("payment")

    if not payment:
        return False

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

    st.markdown(
        """
        <style>
        #MainMenu {visibility: hidden;}
        header {visibility: hidden;}
        footer {visibility: hidden;}

        .stApp {
            background-color: #ffffff;
        }

        .block-container {
            padding-top: 0rem !important;
            padding-bottom: 0rem !important;
            max-width: 100% !important;
        }

        .redirect-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 32px;
            box-sizing: border-box;
        }

        .redirect-card {
            width: 100%;
            max-width: 440px;
            text-align: center;
            background: #ffffff;
            box-sizing: border-box;
            margin: 0 auto;
        }

        .redirect-logo {
            display: flex;
            justify-content: center;
            margin-bottom: 34px;
        }

        .redirect-title {
            font-size: 30px;
            font-weight: 700;
            color: #111111;
            margin-bottom: 12px;
        }

        .redirect-text {
            font-size: 17px;
            color: #333333;
            line-height: 1.45;
            margin-bottom: 28px;
        }

        .redirect-close {
            font-size: 15px;
            color: #666666;
            border-top: 1px solid #dddddd;
            padding-top: 22px;
            margin-top: 26px;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    status_html = ""
    if payment == "success":
        status_html = """
            <div class="redirect-title">Payment received</div>
            <div class="redirect-text">Thank you. Your payment has been processed successfully.</div>
        """
    elif payment == "cancelled":
        status_html = """
            <div class="redirect-title">Payment cancelled</div>
            <div class="redirect-text">No payment was processed.</div>
        """
    else:
        status_html = """
            <div class="redirect-title">Payment status unavailable</div>
            <div class="redirect-text">We could not confirm the payment status from this link.</div>
        """

    st.markdown('<div class="redirect-wrap"><div class="redirect-card">', unsafe_allow_html=True)

    if logo_path:
        st.markdown('<div class="redirect-logo">', unsafe_allow_html=True)
        st.image(str(logo_path), width=180)
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown(
        status_html + '<div class="redirect-close">You may now close this page.</div>',
        unsafe_allow_html=True,
    )

    st.markdown('</div></div>', unsafe_allow_html=True)

    return True


if show_payment_redirect_global():
    st.stop()


# -----------------------------
# Staff app
# -----------------------------
if "page" not in st.session_state:
    st.session_state.page = "home"


def go_home():
    st.session_state.page = "home"


def go_customer_notification():
    st.session_state.page = "customer_notification"


if st.session_state.page == "home":
    st.markdown(
        """
        <style>
        .stApp {
            background-color: #f6f6f4;
        }

        .block-container {
            max-width: 1220px;
            padding-top: 28px;
            padding-bottom: 40px;
        }

        .home-hero {
            background: #111111;
            border-radius: 18px;
            padding: 28px 32px;
            margin-bottom: 28px;
        }

        .home-title {
            color: white;
            font-size: 2.4rem;
            font-weight: 700;
            line-height: 1.1;
            margin: 0;
        }

        .home-sub {
            color: #d6d6d6;
            font-size: 1rem;
            margin-top: 8px;
        }

        .tool-card {
            background: white;
            border: 1px solid #dadada;
            border-radius: 16px;
            padding: 20px;
            min-height: 180px;
        }

        .tool-title {
            font-size: 1.2rem;
            font-weight: 700;
            color: #111111;
            margin-bottom: 8px;
        }

        .tool-text {
            color: #666666;
            font-size: 0.95rem;
            margin-bottom: 18px;
        }

        .stButton > button {
            background: #111111 !important;
            color: white !important;
            border: 1px solid #111111 !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            min-height: 44px !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

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
            <div class="home-hero">
                <div class="home-title">Delivery Tools - ADL</div>
                <div class="home-sub">Select a tool below</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    col = st.columns(1)[0]

    with col:
        st.markdown(
            """
            <div class="tool-card">
                <div class="tool-title">Customer Notification - BCA</div>
                <div class="tool-text">
                    Load Tour Totals, prepare payment data, create Stripe links, and send SMS messages.
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        st.button(
            "Open Customer Notification",
            use_container_width=True,
            on_click=go_customer_notification,
            key="home_customer_notification_button",
        )

elif st.session_state.page == "customer_notification":
    show_customer_notification_page()
