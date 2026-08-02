npx tsc -b


mkdir -p ./dist/bin

cp src/kernel/ui/styles.css build/kernel/ui/styles.css
npx rollup -c
cp src/pkgs/packages.json dist/pkgs/packages.json

node ./scripts/build.mjs
node ./build/mkportable.js
