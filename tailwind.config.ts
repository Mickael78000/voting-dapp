const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Dynamic color utilities used via string interpolation
    'bg-blue-500/10',
    'border-blue-500/20',
    'text-blue-300',
    'bg-purple-500/10',
    'border-purple-500/20',
    'text-purple-300',
  ],
  theme: {
    extend: {},
  },
}
export default config
