import React from 'react';
import {render,screen} from '@testing-library/react';
import {useSpace} from '../../contexts/SpaceContext';
import SpaceSwitcher from '../SpaceSwitcher';
jest.mock('../../contexts/SpaceContext',()=>({useSpace:jest.fn()}));
test.each([false,true])('indica modo de lectura únicamente cuando faltan ambos permisos (%s)',editable=>{const shared={ownerId:'owner',ownerName:'Hogar ficticio',isOwner:false,canEdit:editable,canDelete:false};useSpace.mockReturnValue({spaces:[{ownerId:'own',isOwner:true},shared],activeSpace:shared,switchSpace:jest.fn()});render(<SpaceSwitcher/>);if(editable)expect(screen.queryByText('Solo lectura')).not.toBeInTheDocument();else expect(screen.getByText('Solo lectura')).toBeInTheDocument();});
