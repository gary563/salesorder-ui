# deploy.ps1 - build the Spring Boot jar on Windows and push it to EC2
# Usage (from your project folder):
#   .\deploy.ps1 -Ip 13.x.x.x -Key C:\path\to\springboot-key.pem
param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [Parameter(Mandatory = $true)][string]$Key
)
$ErrorActionPreference = "Stop"

# 0. Windows OpenSSH refuses keys that other users can read: lock the .pem to you only
icacls $Key /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null

# 1. Build (Maven wrapper, Maven, or Gradle wrapper)
if (Test-Path .\mvnw.cmd)        { .\mvnw.cmd -q clean package -DskipTests; $jarDir = "target" }
elseif (Test-Path .\pom.xml)     { mvn -q clean package -DskipTests;        $jarDir = "target" }
elseif (Test-Path .\gradlew.bat) { .\gradlew.bat bootJar;                   $jarDir = "build\libs" }
else { throw "No pom.xml or gradlew.bat found - run this from the project folder." }

$jar = Get-ChildItem $jarDir -Filter *.jar |
       Where-Object { $_.Name -notmatch "plain|sources|javadoc" } |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $jar) { throw "No runnable jar found in $jarDir" }
Write-Host "Uploading $($jar.Name) to $Ip ..."

# 2. Upload and restart the service
scp -i $Key -o StrictHostKeyChecking=accept-new $jar.FullName "ec2-user@${Ip}:/tmp/app.jar"
ssh -i $Key "ec2-user@$Ip" "sudo mv /tmp/app.jar /opt/app/app.jar && sudo chown springapp:springapp /opt/app/app.jar && sudo systemctl restart springapp && sleep 15 && sudo systemctl --no-pager status springapp | head -5"

Write-Host "Done. Open http://$Ip"
