for file in images/*.{jpg,png}; do
    [ ! -f "tn/$file" ] && sips -Z 180 "$file" --out "tn/$file"
done