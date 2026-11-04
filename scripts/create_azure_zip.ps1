Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ZipPath = Join-Path $Root "deploy_booking.zip"

$IncludeDirs = @(
    "dist",
    "contracts"
)

$IncludeRootFiles = @(
    "package.json",
    "package-lock.json",
    "nest-cli.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "openapi.yaml",
    ".npmrc",
    ".nvmrc"
)

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

$Zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
$Count = 0

try {
    foreach ($FileName in $IncludeRootFiles) {
        $FullPath = Join-Path $Root $FileName
        if (Test-Path $FullPath) {
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $Zip,
                $FullPath,
                $FileName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $Count++
        }
    }

    foreach ($DirName in $IncludeDirs) {
        $DirPath = Join-Path $Root $DirName
        if (Test-Path $DirPath) {
            $Files = Get-ChildItem -Path $DirPath -Recurse -File -Force
            foreach ($File in $Files) {
                if ($File.Name.EndsWith(".tsbuildinfo")) { continue }
                $RelPath = $File.FullName.Substring($Root.Length + 1)
                $PosixEntryName = $RelPath -replace '\\', '/'
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $Zip,
                    $File.FullName,
                    $PosixEntryName,
                    [System.IO.Compression.CompressionLevel]::Optimal
                )
                $Count++
            }
        }
    }

    # Include .proto and .graphql files from src/
    $SrcDir = Join-Path $Root "src"
    if (Test-Path $SrcDir) {
        $ContractFiles = Get-ChildItem -Path $SrcDir -Recurse -File -Include *.proto, *.graphql
        foreach ($File in $ContractFiles) {
            $RelPath = $File.FullName.Substring($Root.Length + 1)
            $PosixEntryName = $RelPath -replace '\\', '/'
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $Zip,
                $File.FullName,
                $PosixEntryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $Count++
        }
    }
} finally {
    $Zip.Dispose()
}

$SizeMB = [math]::Round(((Get-Item $ZipPath).Length / 1MB), 2)
Write-Host "OK: deploy_booking.zip generado con $Count archivos ($SizeMB MB) en formato POSIX (/)."
