import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      "scripts/**",
      "docs/**",
      "credentials/**",
    ],
  },
  ...nextConfig,
];

export default eslintConfig;
