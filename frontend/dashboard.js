// Firebase Configuration
import firebaseConfig from "./config";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global error handler
window.showError = function(message) {
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    if (errorModal && errorMessage) {
        errorMessage.textContent = message;
        errorModal.classList.add('active');
    } else {
        alert('Error: ' + message);
    }
};

window.showSuccess = function(message) {
    const successModal = document.getElementById('successModal');
    const successMessage = document.getElementById('successMessage');
    if (successModal && successMessage) {
        successMessage.textContent = message;
        successModal.classList.add('active');
    } else {
        alert('Success: ' + message);
    }
};

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    });
});

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// Check authentication
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        // Update user greeting
        const displayName = user.displayName || user.email.split('@')[0];
        const greetingElement = document.getElementById('userGreeting');
        if (greetingElement) {
            greetingElement.textContent = `Welcome, ${displayName}!`;
        }
        
        // Create user document if it doesn't exist
        db.collection('users').doc(user.uid).get()
            .then((doc) => {
                if (!doc.exists) {
                    db.collection('users').doc(user.uid).set({
                        email: user.email,
                        displayName: displayName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        databases: {}
                    });
                }
            })
            .catch((error) => {
                console.log("Error getting user document:", error);
            });
    }
});

// Logout handler
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await auth.signOut();
            window.location.href = 'index.html';
        } catch (error) {
            showError('Logout failed: ' + error.message);
        }
    });
}

class FormSchemaGenerator {
    constructor() {
        this.API_BASE_URL = 'https://hemimetabolous-gabelled-aline.ngrok-free.dev';
        this.currentSchema = [];
        this.currentFlow = null;
        this.currentMethod = 'csv';
        this.scratchFields = [];
        this.currentUser = null;
        this.activeDatabase = null;
        
        this.init();
    }
    
    init() {
        console.log('Initializing FormSchemaGenerator');

        this.bindEvents();
        this.checkAPIStatus();
        this.setupFileUploads();
        this.setupSelect2();
        
        // Get current user
        auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.loadUserDatabases(user.uid);
                this.loadDataDatabases(user.uid);
                
                // Check localStorage for active database
                const storedDb = localStorage.getItem('activeDatabase');
                const storedUser = localStorage.getItem('activeDatabaseUser');

                console.log('Checking localStorage:', { storedDb, storedUser, currentUser: user.uid }); // Add this
                if (storedDb && storedUser === user.uid) {
                    this.activeDatabase = storedDb;
                    this.showDatabaseInfo(storedDb);
                }
            }
        });
    }
    
    bindEvents() {
        // Method selection
        document.querySelectorAll('.option-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMethod(e.currentTarget.dataset.method);
            });
        });
        
        // CSV Upload
        const loadCsvBtn = document.getElementById('loadCsvBtn');
        if (loadCsvBtn) {
            loadCsvBtn.addEventListener('click', () => this.handleCsvUpload());
        }
        
        const csvFile = document.getElementById('csvFile');
        if (csvFile) {
            csvFile.addEventListener('change', (e) => {
                const fileName = e.target.files[0]?.name || '';
                const csvFileName = document.getElementById('csvFileName');
                if (csvFileName) {
                    csvFileName.textContent = fileName ? `Selected: ${fileName}` : '';
                }
            });
        }
        
        // Google Sheet
        const loadGSheetBtn = document.getElementById('loadGSheetBtn');
        if (loadGSheetBtn) {
            loadGSheetBtn.addEventListener('click', () => this.handleGSheet());
        }
        
        // Build from Scratch
        document.querySelectorAll('.field-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.openAddFieldModal(e.currentTarget.dataset.type);
            });
        });
        
        const createFromScratchBtn = document.getElementById('createFromScratchBtn');
        if (createFromScratchBtn) {
            createFromScratchBtn.addEventListener('click', () => this.createFromScratch());
        }
        
        const saveFieldBtn = document.getElementById('saveFieldBtn');
        if (saveFieldBtn) {
            saveFieldBtn.addEventListener('click', () => this.saveField());
        }
        
        // Field type change in modal
        const fieldInputType = document.getElementById('fieldInputType');
        if (fieldInputType) {
            fieldInputType.addEventListener('change', (e) => {
                const optionsGroup = document.getElementById('optionsGroup');
                if (optionsGroup) {
                    optionsGroup.style.display = e.target.value === 'select' ? 'block' : 'none';
                }
            });
        }
        
        // Schema Editor
        const updateSchemaBtn = document.getElementById('updateSchemaBtn');
        if (updateSchemaBtn) {
            updateSchemaBtn.addEventListener('click', () => this.updateSchema());
        }
        
        const backToInputBtn = document.getElementById('backToInputBtn');
        if (backToInputBtn) {
            backToInputBtn.addEventListener('click', () => this.showStep(1));
        }
        
        const dataDatabaseSelect = document.getElementById('dataDatabaseSelect');
        const loadDataBtn = document.getElementById('loadDataBtn');
        const downloadDataBtn = document.getElementById('downloadDataBtn');
        if (dataDatabaseSelect) {
            dataDatabaseSelect.removeEventListener('change', this.handleDataDatabaseChange);
            this.handleDataDatabaseChange = (e) => {
                if (loadDataBtn) {
                    loadDataBtn.disabled = !e.target.value;
                }
            };
            dataDatabaseSelect.addEventListener('change', this.handleDataDatabaseChange);
        }
        
        if (loadDataBtn) {
            loadDataBtn.removeEventListener('click', this.handleLoadData);
            this.handleLoadData = () => this.loadDataFromDatabase();
            loadDataBtn.addEventListener('click', this.handleLoadData);
        }
        
        if (downloadDataBtn) {
            downloadDataBtn.removeEventListener('click', this.handleDownloadData);
            this.handleDownloadData = () => this.downloadDataAsCSV();
            downloadDataBtn.addEventListener('click', this.handleDownloadData);
        }
        
        // Outputs
        const buildFlowBtn = document.getElementById('buildFlowBtn');
        if (buildFlowBtn) {
            buildFlowBtn.addEventListener('click', () => this.buildFlow());
        }
        
        // Database buttons
        const createDatabaseBtn = document.getElementById('createDatabaseBtn');
        if (createDatabaseBtn) {
            createDatabaseBtn.addEventListener('click', () => this.createDatabase());
        }
        
         // Database buttons - IMPORTANT: Get fresh references each time
        const databaseSelect = document.getElementById('databaseSelect');
        const loadDatabaseBtn = document.getElementById('loadDatabaseBtn');
        
        if (databaseSelect) {
            // Remove any existing listeners to prevent duplicates
            databaseSelect.removeEventListener('change', this.handleDatabaseChange);
            
            // Define the handler
            this.handleDatabaseChange = (e) => {
                const btn = document.getElementById('loadDatabaseBtn');
                if (btn) {
                    btn.disabled = !e.target.value;
                }
            };
            
            // Add the listener
            databaseSelect.addEventListener('change', this.handleDatabaseChange);
        }
        
        if (loadDatabaseBtn) {
            // Remove any existing listeners to prevent duplicates
            loadDatabaseBtn.removeEventListener('click', this.handleLoadDatabase);
            
            // Define the handler with proper binding
            this.handleLoadDatabase = () => {
                console.log('Load Database button clicked'); // Add this for debugging
                this.loadSelectedDatabase();
            };
            
            // Add the listener
            loadDatabaseBtn.addEventListener('click', this.handleLoadDatabase);
        }
                
        // Add Contact button
        const addContactBtn = document.getElementById('addContactBtn');
        if (addContactBtn) {
            addContactBtn.addEventListener('click', () => this.addContact());
        }
        
        // Initialize Flow button
        const initializeFlowBtn = document.getElementById('initializeFlowBtn');
        if (initializeFlowBtn) {
            initializeFlowBtn.removeEventListener('click', this.handleInitializeFlow);
            this.handleInitializeFlow = () => this.initializeFlow();
            initializeFlowBtn.addEventListener('click', this.handleInitializeFlow);
        }

        // Confirm Initialize button
        const confirmInitializeBtn = document.getElementById('confirmInitializeBtn');
        if (confirmInitializeBtn) {
            confirmInitializeBtn.removeEventListener('click', this.handleConfirmInitialize);
            this.handleConfirmInitialize = () => this.confirmInitialize();
            confirmInitializeBtn.addEventListener('click', this.handleConfirmInitialize);
        }
        
        // Modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeAllModals();
            });
        });
    }
    
    setupSelect2() {
        if (typeof $ !== 'undefined' && $.fn.select2) {
            $('#databaseSelect').select2({
                placeholder: '-- Select a database --',
                allowClear: true,
                width: '100%'
            });
        }
    }
    
    setupFileUploads() {
        const fileLabels = document.querySelectorAll('.file-label');
        
        fileLabels.forEach(label => {
            label.addEventListener('dragover', (e) => {
                e.preventDefault();
                label.style.borderColor = '#25D366';
                label.style.background = 'rgba(37, 211, 102, 0.05)';
            });
            
            label.addEventListener('dragleave', (e) => {
                e.preventDefault();
                label.style.borderColor = '';
                label.style.background = '';
            });
            
            label.addEventListener('drop', (e) => {
                e.preventDefault();
                label.style.borderColor = '';
                label.style.background = '';
                
                const file = e.dataTransfer.files[0];
                const input = label.querySelector('input[type="file"]');
                
                if (input) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    input.files = dataTransfer.files;
                    
                    input.dispatchEvent(new Event('change'));
                }
            });
        });
    }
    
    async checkAPIStatus() {
        try {
            console.log('Checking API status at:', `${this.API_BASE_URL}/api/health`);
            const response = await fetch(`${this.API_BASE_URL}/api/health`, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                console.log('API is online');
            } else {
                console.warn('API returned status:', response.status);
            }
        } catch (error) {
            console.error('API is not reachable:', error);
        }
    }
    
    switchMethod(method) {
        this.currentMethod = method;
        
        document.querySelectorAll('.option-card').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.method === method) {
                btn.classList.add('active');
            }
        });
        
        document.querySelectorAll('.input-section').forEach(section => {
            section.classList.remove('active');
        });
        
        const section = document.getElementById(`${method}-section`);
        if (section) {
            section.classList.add('active');
        }
    }
    
    showStep(step) {
        const step1 = document.getElementById('step1');
        const step2 = document.getElementById('step2');
        const step3 = document.getElementById('step3');
        
        if (step1) step1.style.display = step === 1 ? 'block' : 'none';
        if (step2) step2.style.display = step === 2 ? 'block' : 'none';
        if (step3) step3.style.display = step === 3 ? 'block' : 'none';
    }
    
    // CSV Upload
    async handleCsvUpload() {
        const fileInput = document.getElementById('csvFile');
        if (!fileInput) {
            this.showError('File input not found');
            return;
        }
        
        const file = fileInput.files[0];
        
        if (!file) {
            this.showError('Please select a CSV file');
            return;
        }
        
        console.log('Uploading CSV file:', file.name, 'Size:', file.size, 'Type:', file.type);
        
        const formData = new FormData();
        formData.append('file', file);
        
        await this.loadWithLoader('loadCsvBtn', async () => {
            try {
                // First, check if API is reachable
                const healthCheck = await fetch(`${this.API_BASE_URL}/api/health`, {
                    method: 'GET',
                    mode: 'cors'
                }).catch(e => {
                    throw new Error('API health check failed: ' + e.message);
                });
                
                if (!healthCheck.ok) {
                    throw new Error('API is not responding properly');
                }
                
                console.log('Sending CSV to:', `${this.API_BASE_URL}/api/upload/csv`);
                
                const response = await fetch(`${this.API_BASE_URL}/api/upload/csv`, {
                    method: 'POST',
                    mode: 'cors',
                    body: formData
                });
                
                const responseText = await response.text();
                
                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    console.error('Failed to parse JSON response:', responseText);
                    throw new Error('Invalid JSON response from server');
                }
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaEditor();
                    this.showStep(2);
                    this.showSuccess('CSV file processed successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to process CSV file');
                }
            } catch (error) {
                console.error('CSV upload error:', error);
                this.showError('Failed to connect to server: ' + error.message);
            }
        });
    }
    
    // Google Sheet
    async handleGSheet() {
        const url = document.getElementById('sheetUrl')?.value.trim();
        
        if (!url) {
            this.showError('Please enter a Google Sheet URL');
            return;
        }
        
        await this.loadWithLoader('loadGSheetBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/process/gsheet`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaEditor();
                    this.showStep(2);
                    this.showSuccess('Google Sheet processed successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to process Google Sheet');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    // Build from Scratch
    openAddFieldModal(type) {
        const modal = document.getElementById('addFieldModal');
        if (modal) {
            modal.classList.add('active');
            
            const fieldInputType = document.getElementById('fieldInputType');
            if (fieldInputType) {
                fieldInputType.value = type;
            }
            
            const optionsGroup = document.getElementById('optionsGroup');
            if (optionsGroup) {
                optionsGroup.style.display = type === 'select' ? 'block' : 'none';
            }
            
            // Reset form
            const form = document.getElementById('addFieldForm');
            if (form) {
                form.reset();
                if (fieldInputType) fieldInputType.value = type;
            }
        }
    }
    
    saveField() {
        const fieldName = document.getElementById('fieldName')?.value.trim();
        const fieldLabel = document.getElementById('fieldLabel')?.value.trim();
        const inputType = document.getElementById('fieldInputType')?.value;
        const required = document.getElementById('fieldRequired')?.checked || false;
        const validation = document.getElementById('fieldValidation')?.value.trim() || '';
        
        let options = [];
        if (inputType === 'select') {
            const optionsStr = document.getElementById('fieldOptions')?.value || '';
            options = optionsStr.split(',').map(opt => opt.trim()).filter(opt => opt);
        }
        
        if (!fieldName || !fieldLabel) {
            this.showError('Please fill in all required fields');
            return;
        }
        
        const formattedFieldName = fieldName.toLowerCase().replace(/\s+/g, '_');
        
        const field = {
            field_name: formattedFieldName,
            label: fieldLabel,
            input_type: inputType,
            required: required,
            options: options,
            validation: validation
        };
        
        this.scratchFields.push(field);
        this.renderScratchFields();
        this.closeAllModals();
    }
    
    renderScratchFields() {
        const container = document.getElementById('scratchFields');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.scratchFields.forEach((field, index) => {
            const fieldElement = document.createElement('div');
            fieldElement.className = 'scratch-field-item';
            fieldElement.innerHTML = `
                <div class="field-info">
                    <h4>${field.label}</h4>
                    <p>Type: ${field.input_type} | Required: ${field.required ? 'Yes' : 'No'}</p>
                    ${field.options.length ? `<p>Options: ${field.options.join(', ')}</p>` : ''}
                </div>
                <div class="field-actions">
                    <button class="edit-btn" onclick="window.app.editScratchField(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" onclick="window.app.deleteScratchField(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(fieldElement);
        });
    }
    
    editScratchField(index) {
        const field = this.scratchFields[index];
        
        const fieldName = document.getElementById('fieldName');
        const fieldLabel = document.getElementById('fieldLabel');
        const fieldInputType = document.getElementById('fieldInputType');
        const fieldRequired = document.getElementById('fieldRequired');
        const fieldValidation = document.getElementById('fieldValidation');
        const fieldOptions = document.getElementById('fieldOptions');
        const optionsGroup = document.getElementById('optionsGroup');
        
        if (fieldName) fieldName.value = field.field_name;
        if (fieldLabel) fieldLabel.value = field.label;
        if (fieldInputType) fieldInputType.value = field.input_type;
        if (fieldRequired) fieldRequired.checked = field.required;
        if (fieldValidation) fieldValidation.value = field.validation || '';
        
        if (field.input_type === 'select' && optionsGroup && fieldOptions) {
            fieldOptions.value = field.options.join(', ');
            optionsGroup.style.display = 'block';
        }
        
        this.scratchFields.splice(index, 1);
        this.renderScratchFields();
        
        const modal = document.getElementById('addFieldModal');
        if (modal) modal.classList.add('active');
    }
    
    deleteScratchField(index) {
        this.scratchFields.splice(index, 1);
        this.renderScratchFields();
    }
    
    createFromScratch() {
        if (this.scratchFields.length === 0) {
            this.showError('Please add at least one field');
            return;
        }
        
        this.currentSchema = [...this.scratchFields];
        this.renderSchemaEditor();
        this.showStep(2);
        this.scratchFields = [];
        this.renderScratchFields();
    }
    
    // Schema Editor
    renderSchemaEditor() {
        const editor = document.getElementById('schemaEditor');
        if (!editor) return;
        
        editor.innerHTML = '';
        
        this.currentSchema.forEach((field, index) => {
            const fieldElement = document.createElement('div');
            fieldElement.className = 'field-editor';
            fieldElement.innerHTML = `
                <div class="field-header">
                    <span class="field-title">Field ${index + 1}: ${field.label || field.field_name}</span>
                    <button class="toggle-btn" onclick="this.parentElement.nextElementSibling.style.display = this.parentElement.nextElementSibling.style.display === 'none' ? 'grid' : 'none'">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="field-form" style="display: grid;">
                    <div class="form-group">
                        <label>Label</label>
                        <input type="text" class="field-label" data-index="${index}" value="${field.label || ''}">
                    </div>
                    <div class="form-group">
                        <label>Input Type</label>
                        <select class="field-type" data-index="${index}">
                            <option value="text" ${field.input_type === 'text' ? 'selected' : ''}>Text</option>
                            <option value="number" ${field.input_type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="email" ${field.input_type === 'email' ? 'selected' : ''}>Email</option>
                            <option value="date" ${field.input_type === 'date' ? 'selected' : ''}>Date</option>
                            <option value="select" ${field.input_type === 'select' ? 'selected' : ''}>Select</option>
                            <option value="textarea" ${field.input_type === 'textarea' ? 'selected' : ''}>Textarea</option>
                        </select>
                    </div>
                    <div class="form-group" id="options-${index}" style="${field.input_type === 'select' ? '' : 'display: none;'}">
                        <label>Options (comma separated)</label>
                        <input type="text" class="field-options" data-index="${index}" value="${field.options?.join(', ') || ''}">
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" class="field-required" data-index="${index}" ${field.required ? 'checked' : ''}>
                            Required
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Validation Rule</label>
                        <input type="text" class="field-validation" data-index="${index}" value="${field.validation || ''}">
                    </div>
                </div>
            `;
            editor.appendChild(fieldElement);
            
            const typeSelect = fieldElement.querySelector('.field-type');
            typeSelect.addEventListener('change', (e) => {
                const optionsDiv = document.getElementById(`options-${index}`);
                if (optionsDiv) {
                    optionsDiv.style.display = e.target.value === 'select' ? 'block' : 'none';
                }
            });
        });
    }
    
    async updateSchema() {
        const updatedSchema = this.currentSchema.map((field, index) => {
            return {
                ...field,
                label: document.querySelector(`.field-label[data-index="${index}"]`)?.value || field.label,
                input_type: document.querySelector(`.field-type[data-index="${index}"]`)?.value || field.input_type,
                options: document.querySelector(`.field-options[data-index="${index}"]`)?.value
                    ?.split(',')
                    .map(opt => opt.trim())
                    .filter(opt => opt) || field.options,
                required: document.querySelector(`.field-required[data-index="${index}"]`)?.checked || false,
                validation: document.querySelector(`.field-validation[data-index="${index}"]`)?.value || field.validation
            };
        });
        
        await this.loadWithLoader('updateSchemaBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/update/schema`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ schema: updatedSchema })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaOutput();
                    this.showStep(3);
                    this.showSuccess('Schema updated successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to update schema');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    renderSchemaOutput() {
        const schemaJson = document.getElementById('schemaJson');
        if (!schemaJson) return;
        
        const formattedSchema = this.currentSchema.map(field => ({
            "field_name": field.field_name,
            "label": field.label,
            "input_type": field.input_type,
            "required": field.required,
            "options": field.options || [],
            "validation": field.validation || ""
        }));
        
        schemaJson.textContent = JSON.stringify(formattedSchema, null, 2);
        this.highlightJson(schemaJson);
    }
    
    async buildFlow() {
        if (!this.currentSchema || this.currentSchema.length === 0) {
            this.showError('No schema available. Please generate a schema first.');
            return;
        }
        
        await this.loadWithLoader('buildFlowBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/generate/flow`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        schema: this.currentSchema,
                        flow_id: 'generated_form'
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentFlow = data.flow;
                    this.renderFlowOutput();
                    this.showSuccess('Conversational flow generated successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to generate flow');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    renderFlowOutput() {
        const flowJson = document.getElementById('flowJson');
        if (!flowJson || !this.currentFlow) return;
        
        const formattedFlow = {
            "flow_id": this.currentFlow.flow_id,
            "total_steps": this.currentFlow.total_steps,
            "steps": this.currentFlow.steps.map(step => ({
                "step": step.step,
                "field_name": step.field_name,
                "question": step.question,
                "input_type": step.input_type,
                "required": step.required,
                "options": step.options,
                "validation": step.validation
            })),
            "completion_message": this.currentFlow.completion_message
        };
        
        flowJson.textContent = JSON.stringify(formattedFlow, null, 2);
        this.highlightJson(flowJson);
    }
    
    highlightJson(preElement) {
        const jsonString = preElement.textContent;
        const highlighted = jsonString
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
                let cls = 'number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'key';
                    } else {
                        cls = 'string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'boolean';
                } else if (/null/.test(match)) {
                    cls = 'null';
                }
                return `<span class="${cls}">${match}</span>`;
            });
        
        preElement.innerHTML = highlighted;
        
        if (!document.getElementById('json-highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'json-highlight-styles';
            style.textContent = `
                .string { color: #ce9178; }
                .number { color: #b5cea8; }
                .boolean { color: #569cd6; }
                .null { color: #569cd6; }
                .key { color: #9cdcfe; }
            `;
            document.head.appendChild(style);
        }
    }

    // Load databases for the Show Data section
    async loadDataDatabases(userId) {
        try {
            console.log('Loading databases for Show Data section:', userId);
            const select = document.getElementById('dataDatabaseSelect');
            if (!select) return;
            
            // Clear existing options except first
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Get databases from subcollection
            const databasesRef = db.collection('users').doc(userId).collection('databases');
            const snapshot = await databasesRef.get();
            
            snapshot.forEach(doc => {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = doc.id;
                select.appendChild(option);
            });
            
            // Refresh Select2 if used
            if (typeof $ !== 'undefined' && $.fn.select2) {
                $(select).trigger('change');
            }
            
        } catch (error) {
            console.error('Error loading databases for data section:', error);
        }
    }

    // Load data from selected database
    async loadDataFromDatabase() {
        const select = document.getElementById('dataDatabaseSelect');
        if (!select || !select.value) {
            this.showError('Please select a database');
            return;
        }
        
        const databaseName = select.value;
        
        await this.loadWithLoader('loadDataBtn', async () => {
            try {
                console.log('Loading data from database:', databaseName);
                
                if (!this.currentUser) {
                    this.showError('User not authenticated');
                    return;
                }
                
                // Get reference to submissions collection
                const submissionsRef = db.collection('users')
                    .doc(this.currentUser.uid)
                    .collection('databases')
                    .doc(databaseName)
                    .collection('submissions');
                
                const snapshot = await submissionsRef.get();
                
                const dataContainer = document.getElementById('dataTableContainer');
                const noDataMessage = document.getElementById('noDataMessage');
                
                if (snapshot.empty) {
                    // Show no data message
                    dataContainer.style.display = 'none';
                    noDataMessage.style.display = 'block';
                    return;
                }
                
                // Process the data
                const submissions = [];
                snapshot.forEach(doc => {
                    submissions.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                // Render the table
                this.renderDataTable(submissions);
                
                // Show table, hide no data message
                dataContainer.style.display = 'block';
                noDataMessage.style.display = 'none';
                
                // Update row count
                document.getElementById('rowCount').textContent = `${submissions.length} rows`;
                
                // Store data for download
                this.currentSubmissionsData = submissions;
                
                this.showSuccess(`Loaded ${submissions.length} submissions`);
                
            } catch (error) {
                console.error('Error loading data:', error);
                this.showError('Failed to load data: ' + error.message);
            }
        });
    }

    // Render data table
    renderDataTable(submissions) {
        if (!submissions || submissions.length === 0) return;
        
        // Get all unique field names from all submissions
        const allFields = new Set();
        submissions.forEach(sub => {
            Object.keys(sub).forEach(key => {
                if (key !== 'id') { // Exclude the document ID
                    allFields.add(key);
                }
            });
        });
        
        // Convert to array and sort
        const fields = Array.from(allFields).sort();
        
        // Render table header
        const headerRow = document.getElementById('tableHeader');
        headerRow.innerHTML = '<th>S.No</th>' + fields.map(field => 
            `<th>${field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`
        ).join('');
        
        // Render table body
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = submissions.map((sub, index) => {
            const row = fields.map(field => {
                let value = sub[field];
                if (value && typeof value === 'object') {
                    if (value.seconds) { // Handle Firestore timestamps
                        value = new Date(value.seconds * 1000).toLocaleString();
                    } else {
                        value = JSON.stringify(value);
                    }
                }
                return `<td>${value || ''}</td>`;
            }).join('');
            
            return `<tr><td>${index + 1}</td>${row}</tr>`;
        }).join('');
    }

    // Download data as CSV
    downloadDataAsCSV() {
        if (!this.currentSubmissionsData || this.currentSubmissionsData.length === 0) {
            this.showError('No data to download');
            return;
        }
        
        // Get all unique field names
        const allFields = new Set();
        this.currentSubmissionsData.forEach(sub => {
            Object.keys(sub).forEach(key => {
                if (key !== 'id') {
                    allFields.add(key);
                }
            });
        });
        
        const fields = Array.from(allFields).sort();
        
        // Create CSV header
        const header = ['S.No', ...fields.map(f => f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))];
        
        // Create CSV rows
        const rows = this.currentSubmissionsData.map((sub, index) => {
            return [
                index + 1,
                ...fields.map(field => {
                    let value = sub[field];
                    if (value && typeof value === 'object') {
                        if (value.seconds) {
                            value = new Date(value.seconds * 1000).toLocaleString();
                        } else {
                            value = JSON.stringify(value);
                        }
                    }
                    // Escape commas and quotes for CSV
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        value = `"${value.replace(/"/g, '""')}"`;
                    }
                    return value || '';
                })
            ];
        });
        
        // Combine header and rows
        const csvContent = [
            header.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `submissions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    // Database Functions
    async loadUserDatabases(userId) {
        try {
            console.log('Loading databases for user:', userId);
            const select = document.getElementById('databaseSelect');
            if (!select) return;
            
            // Clear existing options except first
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Use a Set to track unique database names
            const uniqueDatabases = new Set();
            
            // ONLY get databases from subcollection (primary source)
            const databasesRef = db.collection('users').doc(userId).collection('databases');
            const snapshot = await databasesRef.get();
            
            console.log('Found databases in subcollection:', snapshot.size);
            
            snapshot.forEach(doc => {
                uniqueDatabases.add(doc.id);
                console.log('Added database from subcollection:', doc.id);
            });
            
            // Add all unique databases to select
            uniqueDatabases.forEach(dbName => {
                const option = document.createElement('option');
                option.value = dbName;
                option.textContent = dbName;
                select.appendChild(option);
            });
            
            // Refresh Select2
            if (typeof $ !== 'undefined' && $.fn.select2) {
                $(select).trigger('change');
            }
            
            console.log('Total unique database options:', uniqueDatabases.size);
            
        } catch (error) {
            console.error('Error loading databases:', error);
        }
    }
    
    async createDatabase() {
        if (!this.currentUser) {
            this.showError('You must be logged in');
            return;
        }
        
        const databaseName = document.getElementById('databaseName').value.trim();
        
        if (!databaseName) {
            this.showError('Please enter a database name');
            return;
        }
        
        // Validate database name (alphanumeric and underscores only)
        if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
            this.showError('Database name can only contain letters, numbers, and underscores');
            return;
        }
        
        await this.loadWithLoader('createDatabaseBtn', async () => {
            try {
                // Create as subcollection document (primary source)
                const databaseRef = db.collection('users')
                    .doc(this.currentUser.uid)
                    .collection('databases')
                    .doc(databaseName);
                
                // Check if database already exists
                const doc = await databaseRef.get();
                if (doc.exists) {
                    this.showError('A database with this name already exists');
                    return;
                }
                
                // Create database document in subcollection
                await databaseRef.set({
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    created_by: this.currentUser.uid,
                    schema: this.currentSchema,
                    flow: this.currentFlow,
                    name: databaseName
                });
                
                // Set as active database
                this.activeDatabase = databaseName;
                localStorage.setItem('activeDatabase', databaseName);
                localStorage.setItem('activeDatabaseUser', this.currentUser.uid);
                
                await this.showDatabaseInfo(databaseName);
                
                // Reload databases list
                await this.loadUserDatabases(this.currentUser.uid);
                
                // Select the newly created database
                const select = document.getElementById('databaseSelect');
                const option = Array.from(select.options).find(opt => opt.value === databaseName);
                if (option) {
                    select.value = databaseName;
                    if (typeof $ !== 'undefined' && $.fn.select2) {
                        $(select).trigger('change');
                    }
                }
                
                document.getElementById('databaseName').value = '';
                this.showSuccess(`Database "${databaseName}" created successfully!`);
                
            } catch (error) {
                console.error('Error creating database:', error);
                this.showError('Failed to create database: ' + error.message);
            }
        });
    }
    
    async loadSelectedDatabase() {
        console.log('loadSelectedDatabase function called'); // Add this
        
        const select = document.getElementById('databaseSelect');
        if (!select) {
            console.error('Database select element not found');
            this.showError('Database select element not found');
            return;
        }
        
        const databaseName = select.value;
        console.log('Selected database name:', databaseName); // Add this
        
        if (!databaseName) {
            this.showError('Please select a database');
            return;
        }
        
        await this.loadWithLoader('loadDatabaseBtn', async () => {
            try {
                console.log('Loading database:', databaseName);
                
                if (!this.currentUser) {
                    console.error('User not authenticated');
                    this.showError('User not authenticated');
                    return;
                }
                
                console.log('Current user ID:', this.currentUser.uid);
                
                // Get reference to the database document
                const databaseRef = db.collection('users')
                    .doc(this.currentUser.uid)
                    .collection('databases')
                    .doc(databaseName);
                
                console.log('Database reference path:', databaseRef.path);
                
                // Check if the document exists
                const doc = await databaseRef.get();
                console.log('Document exists:', doc.exists);
                
                if (doc.exists) {
                    // Set the active database
                    this.activeDatabase = databaseName;
                    console.log('✅ Active database set to:', this.activeDatabase);
                    
                    // Store in localStorage
                    localStorage.setItem('activeDatabase', databaseName);
                    localStorage.setItem('activeDatabaseUser', this.currentUser.uid);
                    
                    // Show database info
                    await this.showDatabaseInfo(databaseName);
                    
                    // Load contact and submission counts
                    await this.updateDatabaseStats(databaseName);
                    
                    this.showSuccess(`Database "${databaseName}" loaded successfully!`);
                } else {
                    console.error('Database document not found at path:', databaseRef.path);
                    this.showError('Database not found. Please create it first.');
                }
            } catch (error) {
                console.error('Error loading database:', error);
                this.showError('Failed to load database: ' + error.message);
            }
        });
    }
    
    async showDatabaseInfo(databaseName) {
        console.log('Showing database info for:', databaseName);
        
        const infoCard = document.getElementById('databaseInfoCard');
        const activeDatabaseName = document.getElementById('activeDatabaseName');
        
        if (infoCard && activeDatabaseName) {
            activeDatabaseName.textContent = databaseName;
            infoCard.style.display = 'block';
            
            // Force a reflow
            infoCard.offsetHeight;
            
            await this.updateDatabaseStats(databaseName);
            console.log('Database info displayed successfully');
        }
    }

    async updateDatabaseStats(databaseName) {
        try {
            if (!this.currentUser || !databaseName) return;
            
            const databaseRef = db.collection('users')
                .doc(this.currentUser.uid)
                .collection('databases')
                .doc(databaseName);
            
            // Get contacts count
            let contactCount = 0;
            try {
                const contactsSnapshot = await databaseRef.collection('contacts').get();
                contactCount = contactsSnapshot.size;
            } catch (e) {
                console.log('Contacts subcollection not found');
            }
            
            const contactElement = document.getElementById('contactCount');
            if (contactElement) {
                contactElement.textContent = contactCount;
            }
            
            // Get submissions count
            let submissionCount = 0;
            try {
                const submissionsSnapshot = await databaseRef.collection('submissions').get();
                submissionCount = submissionsSnapshot.size;
            } catch (e) {
                console.log('Submissions subcollection not found');
            }
            
            const submissionElement = document.getElementById('submissionCount');
            if (submissionElement) {
                submissionElement.textContent = submissionCount;
            }
            
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }
    
    async addContact() {
        console.log('addContact called');
        console.log('Current activeDatabase:', this.activeDatabase);
        
        // Check localStorage as backup
        if (!this.activeDatabase) {
            const storedDb = localStorage.getItem('activeDatabase');
            const storedUser = localStorage.getItem('activeDatabaseUser');
            
            console.log('Checking localStorage:', { storedDb, storedUser, currentUser: this.currentUser?.uid });
            
            if (storedDb && storedUser === this.currentUser?.uid) {
                console.log('Restoring active database from localStorage:', storedDb);
                this.activeDatabase = storedDb;
            } else {
                this.showError('Please select or create a database first');
                return;
            }
        }
        
        const phoneInput = document.getElementById('phoneNumber');
        if (!phoneInput) {
            this.showError('Phone input not found');
            return;
        }
        
        let phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber) {
            this.showError('Please enter a phone number');
            return;
        }
        
        // Remove any non-digit characters
        phoneNumber = phoneNumber.replace(/\D/g, '');
        
        // Validate 10-digit number
        if (!phoneNumber.match(/^[0-9]{10}$/)) {
            this.showError('Please enter a valid 10-digit mobile number');
            return;
        }
        
        // Add 91 prefix
        const fullPhoneNumber = '91' + phoneNumber;
        
        if (!this.currentUser) {
            this.showError('User not authenticated');
            return;
        }
        
        console.log('Adding contact with:', {
            database: this.activeDatabase,
            user: this.currentUser.uid,
            phone: fullPhoneNumber
        });
        
        await this.loadWithLoader('addContactBtn', async () => {
            try {
                // Get reference to the database
                const databaseRef = db.collection('users')
                    .doc(this.currentUser.uid)
                    .collection('databases')
                    .doc(this.activeDatabase);
                
                // Check if database exists
                const dbDoc = await databaseRef.get();
                if (!dbDoc.exists) {
                    // Create the database document if it doesn't exist
                    await databaseRef.set({
                        created_at: firebase.firestore.FieldValue.serverTimestamp(),
                        created_by: this.currentUser.uid,
                        name: this.activeDatabase
                    });
                    console.log('Created database document on the fly');
                }
                
                // Check if contact already exists
                const contactRef = databaseRef.collection('contacts').doc(fullPhoneNumber);
                const contactDoc = await contactRef.get();
                
                if (contactDoc.exists) {
                    // Contact already exists - show error
                    this.showError(`Contact ${fullPhoneNumber} already exists in this database`);
                    return;
                }
                
                // Create new contact
                await contactRef.set({
                    template_sent: false,
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    phone: fullPhoneNumber
                });
                console.log(`Created new contact: ${fullPhoneNumber}`);
                
                // Update contact count
                await this.updateDatabaseStats(this.activeDatabase);
                
                // Clear input
                phoneInput.value = '';
                
                this.showSuccess(`Contact ${fullPhoneNumber} added successfully!`);
                
            } catch (error) {
                console.error('Error adding contact:', error);
                this.showError('Failed to add contact: ' + error.message);
            }
        });
    }
    
    async initializeFlow() {
        console.log('initializeFlow called');
        
        // Check if flow exists
        if (!this.currentFlow) {
            this.showError('Please build a conversational flow first');
            return;
        }
        
        // Check if user is authenticated
        if (!this.currentUser) {
            this.showError('User not authenticated');
            return;
        }
        
        // Check if database is selected
        if (!this.activeDatabase) {
            // Try to restore from localStorage
            const storedDb = localStorage.getItem('activeDatabase');
            const storedUser = localStorage.getItem('activeDatabaseUser');
            
            if (storedDb && storedUser === this.currentUser?.uid) {
                this.activeDatabase = storedDb;
            } else {
                this.showError('Please select or create a database first');
                return;
            }
        }
        
        // Get contact count
        let contactCount = 0;
        try {
            const databaseRef = db.collection('users')
                .doc(this.currentUser.uid)
                .collection('databases')
                .doc(this.activeDatabase);
            
            const contactsSnapshot = await databaseRef.collection('contacts').get();
            contactCount = contactsSnapshot.size;
        } catch (error) {
            console.error('Error getting contact count:', error);
        }
        
        // Populate confirmation modal
        const confirmModal = document.getElementById('confirmModal');
        const confirmUserId = document.getElementById('confirmUserId');
        const confirmDatabase = document.getElementById('confirmDatabase');
        const confirmContactCount = document.getElementById('confirmContactCount');
        const confirmFlow = document.getElementById('confirmFlow');
        
        if (confirmModal && confirmUserId && confirmDatabase && confirmContactCount && confirmFlow) {
            confirmUserId.textContent = this.currentUser.uid;
            confirmDatabase.textContent = this.activeDatabase;
            confirmContactCount.textContent = contactCount;
            confirmFlow.textContent = JSON.stringify(this.currentFlow, null, 2);
            
            confirmModal.classList.add('active');
        }
    }
    
    // Confirm Initialize button handler
    async confirmInitialize() {
        console.log('confirmInitialize called');
        
        const confirmBtn = document.getElementById('confirmInitializeBtn');
        if (!confirmBtn) return;
        
        const spinner = confirmBtn.querySelector('.fa-spinner');
        const buttonText = confirmBtn.querySelector('span');
        
        if (spinner) spinner.classList.remove('d-none');
        if (buttonText) buttonText.textContent = 'Initializing...';
        confirmBtn.disabled = true;
        
        try {
            // Prepare payload with the exact field names expected by Python backend
            const payload = {
                firebase_uid: this.currentUser.uid,  // Changed from user_id to firebase_uid
                database_name: this.activeDatabase,   // Changed from database to database_name
                flow: this.currentFlow,                // Keep as flow (matches Python)
                timestamp: new Date().toISOString()
            };
            
            console.log('Sending to API gateway:', payload);
            
            // Call your API gateway
            const response = await fetch(`${this.API_BASE_URL}/initialize`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            console.log('API response:', data);
            
            if (response.ok) {
                // Close confirmation modal
                const confirmModal = document.getElementById('confirmModal');
                if (confirmModal) confirmModal.classList.remove('active');
                
                this.showSuccess('Flow initialized successfully! The form is now ready to receive responses.');
                
                console.log('Initialization successful');
            } else {
                this.showError(data.message || data.detail || data.error || 'Failed to initialize flow');
            }
        } catch (error) {
            console.error('Error initializing flow:', error);
            this.showError('Failed to connect to API gateway: ' + error.message);
        } finally {
            if (spinner) spinner.classList.add('d-none');
            if (buttonText) buttonText.textContent = 'Confirm & Initialize';
            confirmBtn.disabled = false;
        }
    }
    
    async loadWithLoader(buttonId, callback) {
        const button = document.getElementById(buttonId);
        
        if (!button) {
            try {
                await callback();
            } catch (error) {
                console.error('Error:', error);
                this.showError('An unexpected error occurred');
            }
            return;
        }
        
        const icon = button.querySelector('.fa-spinner');
        
        if (icon) {
            icon.classList.remove('d-none');
        }
        button.disabled = true;
        
        try {
            await callback();
        } catch (error) {
            console.error('Error:', error);
            this.showError(error.message);
        } finally {
            if (icon) {
                icon.classList.add('d-none');
            }
            button.disabled = false;
        }
    }
    
    showError(message) {
        const errorModal = document.getElementById('errorModal');
        const errorMessage = document.getElementById('errorMessage');
        if (errorModal && errorMessage) {
            errorMessage.textContent = message;
            errorModal.classList.add('active');
        } else {
            alert('Error: ' + message);
        }
    }
    
    showSuccess(message) {
        const successModal = document.getElementById('successModal');
        const successMessage = document.getElementById('successMessage');
        if (successModal && successMessage) {
            successMessage.textContent = message;
            successModal.classList.add('active');
        } else {
            alert('Success: ' + message);
        }
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize the application (only once)
let app;
if (!window.app) {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM Content Loaded - Creating app'); // Add this
        app = new FormSchemaGenerator();
        window.app = app;
    });
} else {
    console.log('App already exists'); // Add this
}