git submodule init
git submodule update

npx tsc -b

cp src/ui/styles.css build/ui/styles.css
npx rollup -c
cp src/pkgs/packages.json dist/pkgs/packages.json

node ./scripts/build.mjs