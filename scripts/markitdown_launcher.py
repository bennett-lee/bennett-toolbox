import sys
import warnings

warnings.filterwarnings(
    "ignore",
    message="Couldn't find ffmpeg or avconv.*",
    category=RuntimeWarning,
)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: markitdown <file>", file=sys.stderr)
        return 2

    try:
        from markitdown import MarkItDown

        converter = MarkItDown()
        result = converter.convert(sys.argv[1])
        sys.stdout.write(result.text_content or "")
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
