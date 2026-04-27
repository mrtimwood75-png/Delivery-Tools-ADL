import streamlit as st
from pathlib import Path

from page_irise_delivery_sheet_creator import show_irise_delivery_sheet_creator_page
from page_customer_notification import show_customer_notification_page

st.set_page_config(
    page_title="Delivery Tools - ADL",
    layout="wide"
)

if "page" not in st.session_state:
    st.session_state.page = "home"


def go_home():
    st.session_state.page = "home"


def go_irise():
    st.session_state.page = "irise"


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

    col1, col2 = st.columns(2, gap="large")

    with col1:
        st.markdown(
            """
            <div class="tool-card">
                <div class="tool-title">iRise Delivery Sheet Creator</div>
                <div class="tool-text">
                    Convert Axapta Packinglist - Order ASCII reports into the delivery import workbook.
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.button(
            "Open iRise Delivery Sheet Creator",
            use_container_width=True,
            on_click=go_irise,
            key="home_irise_button",
        )

    with col2:
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

elif st.session_state.page == "irise":
    show_irise_delivery_sheet_creator_page()

elif st.session_state.page == "customer_notification":
    show_customer_notification_page()
