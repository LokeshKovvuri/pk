Get-Content "$PSScriptRoot\.env" | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim() }
}
python -c "from app.config import get_settings; print('Database:', get_settings().database_url.split('@')[-1])"
python -m uvicorn app.main:app --reload