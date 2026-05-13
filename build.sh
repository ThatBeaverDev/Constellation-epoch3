npx tsc -b

cp src/ui/styles.css build/ui/styles.css
npx rollup -c

node ./scripts/build.mjs