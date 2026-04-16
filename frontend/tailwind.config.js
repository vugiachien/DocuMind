/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Inter', 'sans-serif'],
            },
            colors: {
                surface: {
                    DEFAULT: '#f8f6f1',
                    container: '#eceef0',
                    'container-low': '#f2f4f6',
                    'container-lowest': '#ffffff',
                    'container-high': '#e6e8ea',
                    'container-highest': '#e0e3e5',
                },
                primary: {
                    DEFAULT: '#24303a',
                    container: '#1f2933',
                },
                secondary: {
                    DEFAULT: '#667085',
                    container: '#e8edf0',
                },
                error: {
                    DEFAULT: '#ba1a1a',
                    container: '#ffdad6',
                },
                outline: {
                    DEFAULT: '#76777d',
                    variant: '#c6c6cd',
                },
                on: {
                    surface: '#111827',
                    'surface-variant': '#667085',
                    primary: '#ffffff',
                    'error-container': '#93000a',
                }
            },
        },
    },
    plugins: [],
}
