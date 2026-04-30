import './JsonInput.css'

interface JsonInputProps {
    value: string
    onChange: (value: string) => void
    error: string | null
}

function JsonInput({ value, onChange, error }: JsonInputProps) {
    return (
        <div className="json-input-wrapper">
            <textarea
                className={`json-input ${error ? 'has-error' : ''}`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder='在此粘贴 JSON 字符串，例如：&#10;{&#10;  "name": "张三",&#10;  "age": 25&#10;}'
                spellCheck={false}
            />
            {error && (
                <div className="error-message">
                    <span className="error-icon">⚠️</span>
                    <span className="error-text">{error}</span>
                </div>
            )}
        </div>
    )
}

export default JsonInput
