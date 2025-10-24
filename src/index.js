import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as fs from "fs";
import * as path from "path";

async function run() {
    try {
        // Get inputs
        const scanResultsPath = core.getInput("scan_results_path", { required: true });
        const instructionFilePath = core.getInput("instruction_file_path", { required: true });
        const scannerType = core.getInput("scanner_type", { required: true });
        const apiUrl = core.getInput("api_url", { required: true });
        const apiKey = core.getInput("api_key", { required: true });
        const autoCommit = core.getInput("auto_commit", { required: false }) !== 'false';

        core.info(`Processing scan results with scanner type: ${scannerType}`);

        // Read scan results from file
        core.info(`Reading scan results from: ${scanResultsPath}`);
        let scanResults;
        try {
            const scanResultsContent = fs.readFileSync(scanResultsPath, 'utf8');
            scanResults = JSON.parse(scanResultsContent);
        } catch (error) {
            throw new Error(`Failed to read or parse scan results from ${scanResultsPath}: ${error.message}`);
        }

        // Find and read instruction file
        let instructionFile;
        let instructionFileContents;

        const stats = fs.statSync(instructionFilePath);
        if (stats.isDirectory()) {
            // It's a directory, find first markdown file
            core.info(`Searching for instruction file in directory: ${instructionFilePath}`);
            const files = fs.readdirSync(instructionFilePath);
            const mdFile = files.find(file => file.match(/\.md/i));

            if (!mdFile) {
                throw new Error(`No markdown file found in directory: ${instructionFilePath}`);
            }

            instructionFile = path.join(instructionFilePath, mdFile);
        } else {
            // It's a file
            instructionFile = instructionFilePath;
        }

        core.info(`Reading instruction file: ${instructionFile}`);
        try {
            instructionFileContents = fs.readFileSync(instructionFile, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read instruction file ${instructionFile}: ${error.message}`);
        }

        // Extract filename from filepath
        const filename = path.basename(instructionFile);

        // Construct the API request payload
        const requestBody = {
            scan_results: scanResults,
            instructions: {
                filename: filename,
                content: instructionFileContents
            }
        };

        core.info(`Calling Guardrails API at ${apiUrl}/scan`);

        // Make the API call
        const response = await fetch(`${apiUrl}/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Scanner-Type': scannerType,
                'X-API-Key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        const httpCode = response.status;
        const responseBody = await response.text();

        core.info(`API returned HTTP ${httpCode}`);

        // Check for HTTP errors
        if (httpCode !== 200) {
            throw new Error(`API call failed with HTTP ${httpCode}: ${responseBody}`);
        }

        // Parse the response
        let apiResponse;
        try {
            apiResponse = JSON.parse(responseBody);
        } catch (parseError) {
            throw new Error(`Invalid JSON response from API: ${parseError.message}`);
        }

        // Check for error field in response
        if (apiResponse.error) {
            throw new Error(`API returned error: ${apiResponse.error}`);
        }

        core.info("API call successful");

        // Set outputs
        core.setOutput("api_response", JSON.stringify(apiResponse));
        core.setOutput("instruction_file", instructionFile);

        if (apiResponse.updated_instructions) {
            core.setOutput("updated_instructions", apiResponse.updated_instructions);
            core.info("Updated instructions received from API");

            // Auto-commit if enabled
            if (autoCommit) {
                core.info("Auto-commit enabled, writing and committing updated instructions");

                // Write the updated content to the file
                fs.writeFileSync(instructionFile, apiResponse.updated_instructions, 'utf8');
                core.info(`Updated instructions written to: ${instructionFile}`);

                // Configure git
                await exec.exec('git', ['config', '--local', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
                await exec.exec('git', ['config', '--local', 'user.name', 'github-actions[bot]']);

                // Add the file
                await exec.exec('git', ['add', instructionFile]);

                // Check if there are changes to commit
                let hasStagedChanges = false;
                const gitDiffExitCode = await exec.exec('git', ['diff', '--staged', '--quiet'], {
                    ignoreReturnCode: true
                });
                hasStagedChanges = gitDiffExitCode !== 0;

                if (hasStagedChanges) {
                    // Get PR number if available
                    const prNumber = github.context.payload.pull_request?.number;
                    const commitMessage = prNumber
                        ? `Update instructions via Guardrails scan\n\nUpdated based on security scan results from PR #${prNumber}`
                        : `Update instructions via Guardrails scan`;

                    // Commit changes
                    await exec.exec('git', ['commit', '-m', commitMessage]);
                    core.info("Changes committed");

                    // Get the current branch name
                    let currentBranch = '';
                    if (github.context.payload.pull_request?.head?.ref) {
                        currentBranch = github.context.payload.pull_request.head.ref;
                    } else {
                        // Fallback: get current branch from git
                        const options = {
                            listeners: {
                                stdout: (data) => {
                                    currentBranch += data.toString();
                                }
                            }
                        };
                        await exec.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], options);
                        currentBranch = currentBranch.trim();
                    }

                    // Push changes
                    await exec.exec('git', ['push', 'origin', `HEAD:${currentBranch}`]);
                    core.info(`Changes pushed to branch: ${currentBranch}`);
                } else {
                    core.info("No changes to commit");
                }
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
