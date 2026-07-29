npx tsc -b


mkdir -p ./dist/bin

cp src/ui/styles.css build/ui/styles.css
npx rollup -c
cp src/pkgs/packages.json dist/pkgs/packages.json

node ./scripts/build.mjs
node ./build/mkportable.js
