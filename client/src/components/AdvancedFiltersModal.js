import React, { useState, useEffect } from 'react';

const AdvancedFiltersModal = ({ 
  isOpen, 
  onClose, 
  entities, 
  entityBranches, 
  selectedFilters,
  onApplyFilters 
}) => {
  // State for selected entities and branches
  const [selectedEntities, setSelectedEntities] = useState(selectedFilters.selectedEntities || []);
  const [selectedBranches, setSelectedBranches] = useState(selectedFilters.selectedBranches || []);
  const [showAllBranches, setShowAllBranches] = useState(Object.keys(selectedBranches).length === 0);

  // Handle entity selection
  const handleEntityChange = (entity, isChecked) => {
    if (isChecked) {
      setSelectedEntities([...selectedEntities, entity]);
    } else {
      setSelectedEntities(selectedEntities.filter(e => e !== entity));
      
      // Also remove branches of this entity
      const newSelectedBranches = {...selectedBranches};
      delete newSelectedBranches[entity];
      setSelectedBranches(newSelectedBranches);
    }
  };

  // Handle branch selection
  const handleBranchChange = (entity, branch, isChecked) => {
    const newSelectedBranches = {...selectedBranches};
    
    if (!newSelectedBranches[entity]) {
      newSelectedBranches[entity] = [];
    }
    
    if (isChecked) {
      newSelectedBranches[entity] = [...(newSelectedBranches[entity] || []), branch];
    } else {
      newSelectedBranches[entity] = (newSelectedBranches[entity] || []).filter(b => b !== branch);
      
      // If no branches left for this entity, remove the entity key
      if (newSelectedBranches[entity].length === 0) {
        delete newSelectedBranches[entity];
      }
    }
    
    setSelectedBranches(newSelectedBranches);
    setShowAllBranches(Object.keys(newSelectedBranches).length === 0);
  };

  // Handle "Select All" for an entity
  const handleSelectAllBranches = (entity, isChecked) => {
    const newSelectedBranches = {...selectedBranches};
    
    if (isChecked) {
      newSelectedBranches[entity] = [...entityBranches[entity]];
    } else {
      delete newSelectedBranches[entity];
    }
    
    setSelectedBranches(newSelectedBranches);
    setShowAllBranches(Object.keys(newSelectedBranches).length === 0);
  };

  // Apply filters
  const handleApply = () => {
    onApplyFilters({
      selectedEntities,
      selectedBranches,
      showAllBranches
    });
    onClose();
  };

  // Reset filters
  const handleReset = () => {
    setSelectedEntities([]);
    setSelectedBranches({});
    setShowAllBranches(true);
  };

  // Add/remove modal-open class to body when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup function to ensure we always remove the class
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);
  
  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="modal-container w-full max-w-4xl p-6 inline-block align-bottom sm:align-middle my-8" onClick={e => e.stopPropagation()}>
          <div className="relative bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl w-full">
            {/* Close button */}
            <div className="absolute top-0 right-0 pt-4 pr-4">
              <button
                type="button"
                className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                onClick={onClose}
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Header */}
            <div className="rounded-md bg-indigo-50 border border-indigo-200 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-indigo-800">Advanced Filters</h3>
                  <p className="text-sm text-indigo-700 mt-1">
                    Select multiple entities and specific branches to filter inventory data
                  </p>
                </div>
              </div>
            </div>
          
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 140px)' }}>
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Select Entities</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {entities.map(entity => (
                    <div key={entity} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`entity-${entity}`}
                        checked={selectedEntities.includes(entity)}
                        onChange={(e) => handleEntityChange(entity, e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
                      />
                      <label htmlFor={`entity-${entity}`} className="ml-2 text-sm text-gray-700">
                        {entity}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">Select Branches</h3>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showAllBranches"
                      checked={showAllBranches}
                      onChange={(e) => setShowAllBranches(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <label htmlFor="showAllBranches" className="ml-2 text-xs text-gray-700">
                      Show All Branches
                    </label>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {selectedEntities.map(entity => (
                    <div key={entity} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-gray-800">{entity}</h4>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`all-branches-${entity}`}
                            checked={(selectedBranches[entity]?.length || 0) === entityBranches[entity]?.length}
                            onChange={(e) => handleSelectAllBranches(entity, e.target.checked)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
                          />
                          <label htmlFor={`all-branches-${entity}`} className="ml-2 text-xs text-gray-700">
                            Select All
                          </label>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 ml-2">
                        {entityBranches[entity]?.map(branch => (
                          <div key={`${entity}-${branch}`} className="flex items-center">
                            <input
                              type="checkbox"
                              id={`branch-${entity}-${branch}`}
                              checked={selectedBranches[entity]?.includes(branch) || false}
                              onChange={(e) => handleBranchChange(entity, branch, e.target.checked)}
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
                            />
                            <label htmlFor={`branch-${entity}-${branch}`} className="ml-2 text-xs text-gray-700 truncate">
                              {branch}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {selectedEntities.length === 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500 text-sm">
                      Select at least one entity to view available branches
                    </div>
                  )}
                </div>
              </div>
            </div>
          
            {/* Footer */}
            <div className="border-t border-gray-200 pt-5 pb-2 mt-6">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset All
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={selectedEntities.length === 0}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedFiltersModal;