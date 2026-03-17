for file in images/*.{jpg,png}; do
    [ ! -f "tn/$file" ] && sips -Z 160 "$file" --out "tn/$file"
done