npx tsc -b

cp src/ui/styles.css build/ui/styles.css
cp src/pkgs/packages.json dist/pkgs/packages.json

mkdir -p ./dist/bin

npx rollup -c

node ./scripts/build.mjs