interface DataTemplate {
    Id: string;
    Name: string;
    ContentDocumentLinks?: {
        totalSize: number;
        done: boolean;
        records: ContentDocumentLink[];
    };
}

interface ContentDocumentLink {
    ContentDocumentId: string;
    ContentDocument: {
        Title: string;
    };
}

interface ContentVersion {
    VersionData: string;
}

interface QueryResult<T> {
    totalSize: number;
    done: boolean;
    records: T[];
}

export default class Upsert1Command extends SfdxCommand {
    public static description = messages.getMessage('commandDescription');

    public static flagsConfig = {
        csvdir: Flags.string({
            char: 'd',
            description: messages.getMessage('csvDirFlagDescription'),
            required: true
        }),
        externalid: Flags.string({
            char: 'e',
            required: true,
            description: messages.getMessage('externalIdFlagDescription')
        }),
        datatemplatename: Flags.string({
            char: 'n',
            required: true,
            description: 'Name of the Data_Template__c record to query'
        })
    };

    protected static requiresUsername = true;

    public async run(): Promise<any> {
        this.ux.log('Starting bulk upsert process...');
        await this.fetchUserDetails();
        const { csvdir, externalid, datatemplatename } = this.flags;
        const connection = this.org.getConnection();

        // Step 1: Query and process Data Template directly
        const documents = await this.getContentDocuments(connection, datatemplatename);

        // Step 2: Save all documents locally and get file paths
        const savedFiles = await Promise.all(
            documents.map(doc => this.saveDocument(connection, doc, csvdir))
        );

        // Step 3: Sort files by natural ordering (e.g., Accountc_1 before Accountc_11)
        const sortedFiles = savedFiles.sort((a, b) => this.naturalCompare(a.filePath, b.filePath));

        // Step 4: Process each file in order
        for (const { filePath, objectName } of sortedFiles) {
            this.ux.log(`Processing upsert for ${objectName} from ${filePath}`);
            await this.processCsvFile(filePath, objectName, externalid);
        }

        this.ux.log('\n' + messages.getMessage('bulkUpsertCompleted'));
        return { status: 'success', processedFiles: sortedFiles.length };
    }

    private async getContentDocuments(connection: any, templateName: string): Promise<ContentDocumentLink[]> {
        const query = `SELECT Id, Name, 
                      (SELECT ContentDocumentId, ContentDocument.Title 
                       FROM ContentDocumentLinks) 
                       FROM Data_Template__c 
                       WHERE Name = '${connection.escapeSOQL(templateName)}'`;
        
        const result: QueryResult<DataTemplate> = await connection.query(query);
        
        if (!result.records.length) {
            throw new Error(`No Data_Template__c found with Name: ${templateName}`);
        }
        
        const documents = result.records[0].ContentDocumentLinks?.records || [];
        if (!documents.length) {
            throw new Error(`No ContentDocumentLinks found for template: ${templateName}`);
        }
        
        return documents;
    }

    private async saveDocument(connection: any, doc: ContentDocumentLink, csvDir: string): Promise<{ filePath: string, objectName: string }> {
        const docId = doc.ContentDocumentId;
        const docTitle = doc.ContentDocument.Title;
        const filePath = path.join(csvDir, `${docTitle}.csv`);

        const versionQuery = `SELECT VersionData 
                           FROM ContentVersion 
                           WHERE ContentDocumentId = '${docId}' 
                           AND IsLatest = true`;
        
        const versionResult: QueryResult<ContentVersion> = await connection.query(versionQuery);
        if (!versionResult.records.length) {
            this.ux.warn(`No VersionData found for document: ${docTitle} (ID: ${docId})`);
            return { filePath: '', objectName: '' }; // Skip this file
        }

        const csvData = await connection.request(versionResult.records[0].VersionData);
        fs.writeFileSync(filePath, csvData);
        
        return { 
            filePath, 
            objectName: this.extractObjectName(docTitle) 
        };
    }

    private naturalCompare(a: string, b: string): number {
        // Natural sort for file names (e.g., Accountc_1 before Accountc_11)
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    private extractObjectName(fileName: string): string {
        // Assuming format like "Accountc_1.csv", extract "Accountc"
        return fileName.replace(/_\d+\.csv$/, '');
    }

    private async processCsvFile(filePath: string, sobject: string, extIdField: string): Promise<void> {
        if (!filePath) return; // Skip empty file paths from failed downloads
        
        this.ux.log(`Starting upsert for ${sobject} using file ${filePath}...`);
        const command = `sfdx force:data:bulk:upsert --objecttype ${sobject} --externalid ${extIdField} --csvfile ${filePath}`;
        
        try {
            const { stdout, stderr } = await execPromise(command);
            if (stdout) this.ux.log(`Command output: ${stdout}`);
            if (stderr) this.ux.log(`Command error output: ${stderr}`);
        } catch (error) {
            this.ux.error(`Error upserting ${sobject}: ${error.message}`);
        }
    }

    // ... (keeping fetchUserDetails and fetchAuthenticationInfo the same)
}